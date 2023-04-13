export default class WebSocketUtils {
	private url: string;
	private ws!: WebSocket;
	private reconPeriod: string;

	constructor(url: string, reconPeriod: string) {
		this.url = url;
		this.reconPeriod = reconPeriod;
	}

	public getConnection() {
		return this.ws;
	}

	public async connect(): Promise<WebSocket> {
		console.log("ws is connecting");
		return new Promise<any>((resolve) => {
			const connectWithRetry = () => {
				this.ws = new WebSocket(this.url);
				this.ws.onopen = () => {
					console.log("WebSocket connection opened!");
					resolve(this);
				};
				this.ws.onerror = (event) => {
					console.log("WebSocket encountered an error:", event);
					this.ws.close();
					setTimeout(() => {
						console.log("Retrying WebSocket connection...");
						connectWithRetry();
					}, parseInt(this.reconPeriod));
				};
			};
			connectWithRetry();
		});
	}

	public disconnect(): void {
		this.ws.close();
	}
}
