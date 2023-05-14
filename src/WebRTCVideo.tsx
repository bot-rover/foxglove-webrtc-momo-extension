import { PanelExtensionContext, SettingsTreeAction, ParameterValue, RenderState } from "@foxglove/studio";
import produce from "immer";
import { set } from "lodash";
import { useLayoutEffect, useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom";

import WebRTCUtils from "./webrtcUtils";
import WebSocketUtils from "./websocketUtils";

import SpeedCalculator from "./statUtils";

type panelConfig = {
    connection: {
        ipSource: string;
        ipParam: string;
        ip: string;
        port: string;
        reconnectionPeriod: string;
        maxBandwidth: string;
    };
    encoding: {
        codec: string;
    };
};

function WebRTCVideoPanel({ context }: { context: PanelExtensionContext }): JSX.Element {
    const [parameters, setParameters] = useState<ReadonlyMap<string, ParameterValue>>(new Map());

    const [status, setStatus] = useState("connecting...");
    const [ipAddress, setIpAddress] = useState("");

    const wsRef = useRef<WebSocketUtils | null>(null);
    const webRTCRef = useRef<WebRTCUtils | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    const speedCalculator = new SpeedCalculator();

    const [panelState, setPanel] = useState<panelConfig>(() => {
        const partialState = context.initialState as Partial<panelConfig>;
        return {
            connection: {
                ipSource: partialState.connection?.ipSource ?? "param",
                ipParam: partialState.connection?.ipParam ?? "/foxglove_bridge/address",
                ip: partialState.connection?.ip ?? "localhost",
                port: partialState.connection?.port ?? "8080",
                reconnectionPeriod: partialState.connection?.reconnectionPeriod ?? "3000",
                maxBandwidth: partialState.connection?.maxBandwidth ?? "0",
            },
            encoding: {
                codec: partialState.encoding?.codec ?? "VP9",
            },
        };
    });

    const actionHandler = useCallback(
        (action: SettingsTreeAction) => {
            if (action.action === "update") {
                const { path, value } = action.payload;
                setPanel(produce((draft) => set(draft, path, value)));
                console.log(action.payload);
            }
        },
        [context]
    );

    useLayoutEffect(() => {
        if (panelState.connection.ipSource == "param") {
            context.watch("parameters");
            context.onRender = (renderState: RenderState, done) => {
                if (renderState.parameters != undefined) {
                    setParameters(renderState.parameters);
                }
                done();
            };
        } else if (panelState.connection.ipSource == "manual") {
            setIpAddress(panelState.connection.ip);
        }

        return () => {
            webRTCRef.current?.disconnect();
            wsRef.current?.disconnect();
        };
    }, [context, videoRef]);

    const connect = () => {
        console.log("connection started");

        let uri = "ws://" + ipAddress + ":" + panelState.connection.port + "/ws";

        wsRef.current = new WebSocketUtils(uri, panelState.connection.reconnectionPeriod);
        wsRef.current
            .connect()
            .then((socketUtil) => {
                console.log("creare wrt obj");
                webRTCRef.current = new WebRTCUtils(socketUtil, videoRef, panelState.encoding.codec, panelState.connection.maxBandwidth);
                console.log("connect wrt obj");
                webRTCRef.current.connect();
            })
            .catch((error) => {
                setStatus("ws connection error");
                console.log(error);
            });
    };

    useEffect(() => {
        if (ipAddress) {
            connect();
        }
    }, [ipAddress]);

    useEffect(() => {
        const ip = parameters.get(panelState.connection.ipParam);
        if (ip) {
            if (!ipAddress) {
                setIpAddress(String(ip));
            }
        }
    }, [parameters]);

    useEffect(() => {
        const interval = setInterval(() => {
            webRTCRef.current?.peerConnection?.getStats(null).then((stats) => {
                let speedPerSecond: number = 0;
                let framesPerSecond: number = 0;
                let currentRoundTripTime: number = 0;
                let resolution = "";

                stats.forEach((report) => {
                    if (report.type === "inbound-rtp" && report.kind === "video") {
                        resolution = report.frameWidth + "x" + report.frameHeight;
                        speedCalculator.addData(report.bytesReceived, report.timestamp);
                        speedPerSecond = speedCalculator.calculateSpeedPerSecond();

                        if (report.framesPerSecond) {
                            framesPerSecond = report.framesPerSecond;
                        }
                    }
                    if (report.type === "candidate-pair" && report.state === "succeeded") {
                        currentRoundTripTime = report.currentRoundTripTime;
                    }
                    if (framesPerSecond) {
                        setStatus(framesPerSecond + "fps, " + speedPerSecond + "mbps, " + currentRoundTripTime * 1000 + "ms, " + resolution);
                    } else {
                        setStatus("connection lost");
                    }
                    //console.log(report)
                });
            });
        }, 500);

        return () => clearInterval(interval);
    }, [webRTCRef.current?.peerConnection]);

    useEffect(() => {
        context.saveState(panelState);
        context.updatePanelSettingsEditor({
            actionHandler,
            nodes: {
                connection: {
                    label: "Connection",
                    //icon: "Shapes",
                    fields: {
                        ipSource: {
                            label: "IP Source",
                            input: "select",
                            value: panelState.connection.ipSource,
                            options: [
                                { value: "manual", label: "Manual" },
                                { value: "param", label: "ROS parameter" },
                            ],
                        },
                        ipParam: panelState.connection.ipSource == "param" ? {
                                      label: "ROS parameter",
                                      input: "string",
                                      value: panelState.connection.ipParam,
                                  }
                                : undefined,
                        ip: panelState.connection.ipSource == "manual" ? {
                                      label: "IP",
                                      input: "string",
                                      value: panelState.connection.ip,
                                  }
                                : undefined,
                        port: {
                            label: "Port",
                            input: "string",
                            value: panelState.connection.port,
                        },
                        reconnectionPeriod: {
                            label: "Retry (ms)",
                            input: "string",
                            value: panelState.connection.reconnectionPeriod,
                        },
                        maxBandwidth: {
                            label: "Bandwidth (mbps)",
                            input: "string",
                            value: panelState.connection.maxBandwidth,
                        },
                    },
                },
                encoding: {
                    label: "Encoding",
                    //icon: "Shapes",
                    fields: {
                        codec: {
                            label: "Codec",
                            input: "select",
                            value: panelState.encoding.codec,
                            options: [
                                { value: "H264", label: "H264" },
                                { value: "VP9", label: "VP9" },
                                { value: "VP8", label: "VP8" },
                                { value: "AV1", label: "AV1" },
                            ],
                        },
                    },
                },
            },
        });
    }, [context, actionHandler, panelState]);

    return (
        <div>
            <div>
                <div
                    style={{
                        position: "absolute",
                        margin: "10px",
                        padding: "5px",
                        borderRadius: "3px",
                        background: "rgba(0,0,0,0.5)",
                        color: "#fff",
                    }}
                >
                    {status}
                </div>
                <video
                    id="remotevideo"
                    style={{
                        width: "100%",
                    }}
                    ref={videoRef}
                    autoPlay
                />
            </div>
        </div>
    );
}

export function WebRTCVideo(context: PanelExtensionContext): () => void {
    ReactDOM.render(<WebRTCVideoPanel context={context} />, context.panelElement);
    return () => {
        ReactDOM.unmountComponentAtNode(context.panelElement);
    };
}
