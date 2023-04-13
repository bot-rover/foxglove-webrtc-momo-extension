const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
const peerConnectionConfig = { iceServers: iceServers };

export default class WebRTCUtils {
	public peerConnection?: RTCPeerConnection | null;
	private socket: WebSocket;
	private socketUtil: any;
	private candidates: RTCIceCandidate[] = [];
	private hasReceivedSdp = false;
	private codec: string;
	private maxBandwidth: number;

	private videoRef: React.RefObject<HTMLVideoElement>;

	constructor(
		socket: any,
		videoRef: React.RefObject<HTMLVideoElement>,
		codec: string,
		maxBandwidth: string
	) {
		this.socketUtil = socket;
		this.socket = socket.getConnection();
		this.videoRef = videoRef;
		this.codec = codec;
		this.maxBandwidth = parseFloat(maxBandwidth);
	}

	public async connect() {
		console.group();
		if (!this.peerConnection) {
			console.log("make Offer");
			this.setListeners();
			this.makeOffer();
		} else {
			console.warn("peer connection already exists.");
		}
		console.groupEnd();
	}

	public async disconnect(): Promise<any> {
		console.log(this.peerConnection);
		console.log("close");
		console.group();
		if (this.peerConnection) {
			if (this.peerConnection.iceConnectionState !== "closed") {
				this.peerConnection.close();
				this.peerConnection = null;
				this.candidates = [];
				this.hasReceivedSdp = false;

				const message = JSON.stringify({ type: "close" });
				this.socket?.send(message);

				console.log("sending close message");
				//cleanupVideoElement(remoteVideo);
				return;
			}
		}
		console.log("peerConnection is closed.");
		console.groupEnd();
	}

	public async reconnect() {
		this.socketUtil.connect().then((ws: any) => {
			this.peerConnection?.close();
			this.peerConnection = null;

			this.socketUtil = ws;
			this.socket = this.socketUtil.getConnection();
			this.connect();
		});
	}

	private async makeOffer() {
		this.peerConnection = this.prepareNewConnection();
		try {
			const sessionDescription = await this.peerConnection.createOffer({
				offerToReceiveAudio: true,
				offerToReceiveVideo: true,
			});

			console.log("createOffer() success in promise, SDP=", sessionDescription.sdp);

			if (this.maxBandwidth) {
				sessionDescription.sdp = this.updateBandwidthRestriction(
					sessionDescription.sdp,
					this.maxBandwidth
				); // mbps
			}

			switch (this.codec) {
				case "H264":
					sessionDescription.sdp = this.removeCodec(sessionDescription.sdp, "VP8");
					sessionDescription.sdp = this.removeCodec(sessionDescription.sdp, "VP9");
					sessionDescription.sdp = this.removeCodec(sessionDescription.sdp, "AV1");
					break;
				case "VP8":
					sessionDescription.sdp = this.removeCodec(sessionDescription.sdp, "H264");
					sessionDescription.sdp = this.removeCodec(sessionDescription.sdp, "VP9");
					sessionDescription.sdp = this.removeCodec(sessionDescription.sdp, "AV1");
					break;
				case "VP9":
					sessionDescription.sdp = this.removeCodec(sessionDescription.sdp, "H264");
					sessionDescription.sdp = this.removeCodec(sessionDescription.sdp, "VP8");
					sessionDescription.sdp = this.removeCodec(sessionDescription.sdp, "AV1");
					break;
				case "AV1":
					sessionDescription.sdp = this.removeCodec(sessionDescription.sdp, "H264");
					sessionDescription.sdp = this.removeCodec(sessionDescription.sdp, "VP8");
					sessionDescription.sdp = this.removeCodec(sessionDescription.sdp, "VP9");
					break;
			}

			await this.peerConnection.setLocalDescription(sessionDescription);
			console.log("setLocalDescription() success in promise");
			this.sendSdp(this.peerConnection.localDescription);
		} catch (error) {
			console.error("makeOffer() ERROR:", error);
		}
	}

	private drainCandidate() {
		this.hasReceivedSdp = true;
		this.candidates.forEach((candidate) => {
			this.addIceCandidate(candidate);
		});
		this.candidates = [];
	}

	private addIceCandidate(candidate: RTCIceCandidate | RTCIceCandidateInit | undefined) {
		if (this.peerConnection) {
			this.peerConnection.addIceCandidate(candidate);
		} else {
			console.error("PeerConnection does not exist!");
		}
	}

	private sendIceCandidate(candidate: RTCIceCandidate) {
		console.log("---sending ICE candidate ---");
		const message = JSON.stringify({ type: "candidate", ice: candidate });
		console.log("sending candidate=" + message);
		if (this.socket) this.socket.send(message);
	}

	private prepareNewConnection() {
		const peer = new RTCPeerConnection(peerConnectionConfig);

		if ("ontrack" in peer) {
			let mediaStream = new MediaStream();
			peer.ontrack = (event) => {
				console.log("-- peer.ontrack()");
				mediaStream.addTrack(event.track);
				this.playVideo(mediaStream);
			};
		}

		peer.onicecandidate = (event) => {
			console.log("-- peer.onicecandidate()");
			if (event.candidate) {
				console.log(event.candidate);
				this.sendIceCandidate(event.candidate);
			} else {
				console.log("empty ice event");
			}
		};

		peer.oniceconnectionstatechange = (event) => {
			console.log("-- peer.oniceconnectionstatechange()");
			console.log("ICE connection Status has changed to " + peer.iceConnectionState);
			switch (peer.iceConnectionState) {
				case "closed":
				case "failed":
				case "disconnected":
					//this.reconnect()
					break;
			}
			console.log(event);
			console.log("---------------------------------");
		};

		peer.onconnectionstatechange = (event) => {
			console.log("-- peer.onconnectionstatechange()");
			// dis on server crash
			console.log("Connection Status has changed to " + peer.connectionState);
			console.log(event);
			console.log("---------------------------------");

			if (peer.connectionState == "failed") {
				this.reconnect();
			}
		};

		peer.addTransceiver("video", { direction: "recvonly" });
		peer.addTransceiver("audio", { direction: "recvonly" });

		return peer;
	}

	private sendSdp(sessionDescription: RTCSessionDescription | null) {
		console.log("---sending sdp ---");
		const message = JSON.stringify(sessionDescription);
		console.log("sending SDP=" + message);
		if (this.socket) this.socket.send(message);
	}

	private setOffer(sessionDescription: RTCSessionDescription | RTCSessionDescriptionInit) {
		if (this.peerConnection) {
			console.error("peerConnection already exists!");
		}
		this.peerConnection = this.prepareNewConnection();
		this.peerConnection.onnegotiationneeded = async () => {
			try {
				if (this.peerConnection) {
					await this.peerConnection.setRemoteDescription(sessionDescription);
				}
				console.log("setRemoteDescription(offer) success in promise");
				this.makeAnswer();
			} catch (error) {
				console.error("setRemoteDescription(offer) ERROR: ", error);
			}
		};
	}

	private async makeAnswer() {
		console.log("sending Answer. Creating remote session description...");
		if (!this.peerConnection) {
			console.error("peerConnection DOES NOT exist!");
			return;
		}
		try {
			const sessionDescription = await this.peerConnection.createAnswer();
			console.log("createAnswer() success in promise");
			await this.peerConnection.setLocalDescription(sessionDescription);
			console.log("setLocalDescription() success in promise");
			this.sendSdp(this.peerConnection.localDescription);
			this.drainCandidate();
		} catch (error) {
			console.error("makeAnswer() ERROR:", error);
		}
	}

	private async setAnswer(
		sessionDescription: RTCSessionDescriptionInit | RTCSessionDescription
	) {
		if (!this.peerConnection) {
			console.error("peerConnection DOES NOT exist!");
			return;
		}
		try {
			await this.peerConnection.setRemoteDescription(sessionDescription);
			console.log("setRemoteDescription(answer) success in promise");
			console.log(sessionDescription)
			this.drainCandidate();
		} catch (error) {
			console.error("setRemoteDescription(answer) ERROR: ", error);
		}
	}

	private updateBandwidthRestriction(orgsdp: string | undefined, bandwidth: number) {
		bandwidth = bandwidth * 1000;
		let modifier = "AS";
		if (orgsdp?.indexOf("b=" + modifier + ":") === -1) {
			// insert b= after c= line.
			orgsdp = orgsdp.replace(
				/c=IN (.*)\r\n/,
				"c=IN $1\r\nb=" + modifier + ":" + bandwidth + "\r\n"
			);
		} else {
			orgsdp = orgsdp?.replace(
				new RegExp("b=" + modifier + ":.*\r\n"),
				"b=" + modifier + ":" + bandwidth + "\r\n"
			);
		}
		return orgsdp;
	}

	private removeCodec(orgsdp: string | undefined, codec: string) {
		const internalFunc: any = (sdp: string | undefined) => {
			const codecre = new RegExp("(a=rtpmap:(\\d*) " + codec + "/90000\\r\\n)");
			if (sdp) {
				const rtpmaps = sdp.match(codecre);
				if (rtpmaps == null || rtpmaps.length <= 2) {
					return sdp;
				}
				const rtpmap = rtpmaps[2];
				let modsdp = sdp.replace(codecre, "");

				const rtcpre = new RegExp("(a=rtcp-fb:" + rtpmap + ".*\r\n)", "g");
				modsdp = modsdp.replace(rtcpre, "");

				const fmtpre = new RegExp("(a=fmtp:" + rtpmap + ".*\r\n)", "g");
				modsdp = modsdp.replace(fmtpre, "");

				const aptpre = new RegExp("(a=fmtp:(\\d*) apt=" + rtpmap + "\\r\\n)");
				const aptmaps = modsdp.match(aptpre);
				let fmtpmap: any = "";
				if (aptmaps != null && aptmaps.length >= 3) {
					fmtpmap = aptmaps[2];
					modsdp = modsdp.replace(aptpre, "");

					const rtppre = new RegExp("(a=rtpmap:" + fmtpmap + ".*\r\n)", "g");
					modsdp = modsdp.replace(rtppre, "");
				}

				let videore = /(m=video.*\r\n)/;
				const videolines = modsdp.match(videore);
				if (videolines != null) {
					//If many m=video are found in SDP, this program doesn't work.
					let videoline = videolines[0].substring(0, videolines[0].length - 2);
					const videoelems = videoline.split(" ");
					let modvideoline: any = videoelems[0];
					videoelems.forEach((videoelem: string, index: number) => {
						if (index === 0) return;
						if (videoelem == rtpmap || videoelem == fmtpmap) {
							return;
						}
						modvideoline += " " + videoelem;
					});
					modvideoline += "\r\n";
					modsdp = modsdp.replace(videore, modvideoline);
				}
				return internalFunc(modsdp);
			}
		};
		return internalFunc(orgsdp);
	}

	private playVideo(stream: MediaStream) {
		this.videoRef.current!.srcObject = stream;
	}

	private setListeners() {
		this.socket?.addEventListener("message", (event) => {
			const message = JSON.parse(event.data);
			if (message.type === "offer") {
				console.log("Received offer ...");
				const offer = new RTCSessionDescription(message);
				console.log("offer: ", offer);
				this.setOffer(offer);
			} else if (message.type === "answer") {
				console.log("Received answer ...");
				const answer = new RTCSessionDescription(message);
				console.log("answer: ", answer);
				this.setAnswer(answer);
			} else if (message.type === "candidate") {
				console.log("Received ICE candidate ...");
				const candidate = new RTCIceCandidate(message.ice);
				console.log("candidate: ", candidate);
				if (this.hasReceivedSdp) {
					this.addIceCandidate(candidate);
				} else {
					this.candidates.push(candidate);
				}
			} else if (message.type === "close") {
				console.log("peer connection is closed ...");
			}
		});
	}
}
