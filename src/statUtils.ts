interface Data {
	value: number;
	time: number;
}

class SpeedCalculator {
	private data: Data[] = [];

	public addData(value: number, time: number): void {
		this.data.push({ value, time });
	}

	public calculateSpeedPerSecond(): number {
		if (this.data.length < 2) {
			return 0;
		}

		const latestData = this.data[this.data.length - 1];
		if (!latestData) {
			return 0;
		}

		const oldestData = this.data[0];
		if (!oldestData) {
			return 0;
		}

		const timeDiffInSeconds = (latestData.time - oldestData.time) / 1000;
		const bitsSent = latestData.value * 8;
		const bitrateMbps: number = bitsSent / timeDiffInSeconds / 1000000;

		return parseFloat(bitrateMbps.toFixed(3));
	}
}

export default SpeedCalculator;
