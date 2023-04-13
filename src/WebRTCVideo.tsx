import { PanelExtensionContext, SettingsTreeAction } from "@foxglove/studio";
import produce from "immer";
import { set } from "lodash";
import { useLayoutEffect, useEffect, useState, useRef, useCallback } from "react";
import ReactDOM from "react-dom";

import WebRTCUtils from "./webrtcUtils";
import WebSocketUtils from "./websocketUtils";

import SpeedCalculator from "./statUtils";

type panelConfig = {
	connection: {
		port: string;
		reconnectionPeriod: string;
		maxBandwidth: string;
	};
	encoding: {
		codec: string;
	};
};

function WebRTCVideoPanel({ context }: { context: PanelExtensionContext }): JSX.Element {
	const [status, setStatus] = useState("connecting...");

	const wsRef = useRef<WebSocketUtils | null>(null);
	const webRTCRef = useRef<WebRTCUtils | null>(null);
	const videoRef = useRef<HTMLVideoElement>(null);

	const speedCalculator = new SpeedCalculator();

	const [panelState, setPanel] = useState<panelConfig>(() => {
		const partialState = context.initialState as Partial<panelConfig>;
		return {
			connection: {
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
		
		if (context.dataSourceProfile) {
			console.log("connection started");

			let ip = context.connection.parameters.url.match(
				/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/
			);
			let uri = "ws://" + ip + ":" + panelState.connection.port + "/ws";

			wsRef.current = new WebSocketUtils(uri, panelState.connection.reconnectionPeriod);
			wsRef.current
				.connect()
				.then((socketUtil) => {
					console.log("creare wrt obj");
					webRTCRef.current = new WebRTCUtils(
						socketUtil,
						videoRef,
						panelState.encoding.codec,
						panelState.connection.maxBandwidth
					);
					console.log("connect wrt obj");
					webRTCRef.current.connect();
				})
				.catch((error) => {
					setStatus("ws connection error");
					console.log(error);
				});
		}

		return () => {
			webRTCRef.current?.disconnect();
			wsRef.current?.disconnect();
		};
	}, [context, videoRef]);

	useEffect(() => {
		const interval = setInterval(() => {
			webRTCRef.current?.peerConnection?.getStats(null).then((stats) => {
				let speedPerSecond: number = 0;
				let framesPerSecond: number = 0;
				let currentRoundTripTime: number = 0;
				let resolution = '';

				stats.forEach((report) => {
					if (report.type === "inbound-rtp" && report.kind === "video") {
						resolution = report.frameWidth + "x" +report.frameHeight
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
						setStatus(
							framesPerSecond + "fps, " +
							speedPerSecond + "mbps, " +
							currentRoundTripTime * 1000 + "ms, " +
							resolution
						);
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
