import { ExtensionContext } from "@foxglove/studio";
import { WebRTCVideo } from "./WebRTCVideo";

export function activate(extensionContext: ExtensionContext): void {
  extensionContext.registerPanel({ name: "WebRTC Camera", initPanel: WebRTCVideo });
}
