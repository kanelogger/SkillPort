import { toDesktopError } from "skill-port-cli/desktop";
import { createSerialDispatcher } from "./rpc-handler.js";
import { parseRpcRequest, type RpcResponse } from "./shared/rpc.js";

const parentPort = process.parentPort;
if (!parentPort) throw new Error("Skill Port worker requires an Electron parent port.");

const dispatch = createSerialDispatcher();
parentPort.on("message", (event) => {
  void (async () => {
    let id = "invalid";
    try {
      const request = parseRpcRequest(event.data);
      id = request.id;
      const data = await dispatch(request);
      parentPort.postMessage({ id, ok: true, data } satisfies RpcResponse);
    } catch (error) {
      parentPort.postMessage({ id, ok: false, error: toDesktopError(error) } satisfies RpcResponse);
    }
  })();
});
