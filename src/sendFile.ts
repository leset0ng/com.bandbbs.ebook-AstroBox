import AstroBox from "astrobox-plugin-sdk";
import InterHandshake from "./handshake";
import { formatBytes } from "./utils";

// --- Message Type Definitions ---

// Data payloads for messages SENT TO the device.
// Note: These do NOT contain 'tag'. The 'interconn' class adds it.
interface StartTransferData { stat: "startTransfer"; filename: string; total: number; chunkSize: number; }
interface DataChunkData { stat: "d"; setCount?: number | null; count: number; data: string; }
interface CancelData { stat: "cancel"; }
interface GetUsageData { stat: "getUsage"; }

// Data payloads for messages RECEIVED FROM the device.
// This is the structure the 'data' property of the incoming message should have.
type FileMessageFromDevice = ReadyMessage | ErrorMessage | SuccessMessage | NextMessage | CancelMessage;
interface ReadyMessage { type: "ready"; found: boolean; usage: number; length?: number; }
interface ErrorMessage { type: "error"; message: string; count: number; }
interface SuccessMessage { type: "success"; message: string; count: number; }
interface NextMessage { type: "next"; message: string; count: number; }
interface CancelMessage { type: "cancel"; }


// --- File Class Implementation ---

export default class File {
    private readonly conn: InterHandshake;
    private readonly FILE_SIZE = 1024 * 20; // 20kb

    private curFile: string = "";

    private totalChunk: number = 0;
    private lastChunkTime: number = 0;
    private chunkSize: number = 0;
    private busy: boolean = false;
    private nextChunk: Promise<string> = Promise.resolve("");

    // Callbacks
    private onError: (message: string, count: number) => void = () => { };
    private onSuccess: (message: string, count: number) => void = () => { };
    private onProgress: (progress: number, status: string) => void = () => { };

    constructor(conn: InterHandshake) {
        this.conn = conn;

        // CRITICAL NOTE: The 'interconn' listener passes 'd.data'.
        // The Kotlin peer sends a flat object, so 'message' here will be 'undefined',
        // causing a crash. This listener is written assuming a compatible peer.
        this.conn.addListener<FileMessageFromDevice>("file", (message) => {
            if (!this.busy || !message) {
                if (!message && this.busy) {
                    this.onError("Received incompatible (or empty) message from peer.", 0);
                }
                return;
            }

            try {
                switch (message.type) {
                    case "ready":
                        if (message.usage > 25 * 1024 * 1024) { // 25MB
                            this.onError("存储空间不足", 0);
                            this.busy = false;
                            return;
                        }
                        if (message.found && message.length && message.length > 0) {
                            const currentChunk = Math.floor(message.length / this.FILE_SIZE);
                            this.nextChunk = AstroBox.filesystem.readFile(this.curFile, {
                                offset: (currentChunk > this.totalChunk ? 0 : currentChunk) * this.chunkSize,
                                len: this.chunkSize,
                                decode_text: true,
                            }) as Promise<string>;
                            this.sendNextChunk(currentChunk > this.totalChunk ? 0 : currentChunk, true);
                        } else {
                            this.sendNextChunk(0);
                        }
                        break;

                    case "error":
                        this.sendNextChunk(message.count);
                        break;

                    case "success":
                        this.busy = false;
                        this.onProgress(1.0, "传输完成");
                        this.onSuccess(message.message, message.count);
                        break;

                    case "next":
                        this.sendNextChunk(message.count);
                        break;

                    case "cancel":
                        this.busy = false;
                        this.onSuccess("传输已取消", 0);
                        break;
                }
            } catch (e) {
                console.error("Error processing file message:", message, e);
                this.onError("解析消息失败", 0);
            }
        });
    }

    /**
     * Sends file content to the device.
     * @param filename The name of the file.
     * @param path The path of the file.
     * @param onProgress Progress callback (0-1, chunk preview, status string).
     * @param onSuccess Success callback.
     * @param onError Error callback.
     */
    public async sendFile(
        filename: string,
        path: string,
        size: number,
        text_len: number,
        onProgress: (progress: number, status: string) => void,
        onSuccess: (message: string, count: number) => void,
        onError: (message: string, count: number) => void,
    ) {
        if (this.busy) {
            onError("A file transfer is already in progress.", 0);
            return;
        }

        this.busy = true;
        this.onProgress = onProgress;
        this.onSuccess = onSuccess;
        this.onError = onError;
        this.lastChunkTime = 0;

        this.totalChunk = Math.ceil(size / this.FILE_SIZE);
        this.chunkSize = Math.floor(text_len / this.totalChunk);

        if (this.totalChunk === 0) {
            onSuccess("File is empty, nothing to send.", 0);
            this.busy = false;
            return;
        }

        this.curFile = path;

        onProgress(0.0 , "Preparing to send...");

        const startMessage: StartTransferData = {
            stat: "startTransfer",
            filename: filename,
            total: this.totalChunk,
            chunkSize: this.FILE_SIZE,
        };

        try {
            // Correctly call send() with tag and data object.
            // CRITICAL NOTE: The Kotlin peer will not understand the resulting
            // '{"tag":"file", "data":{...}}' structure.
            this.nextChunk = AstroBox.filesystem.readFile(this.curFile, {
                offset: 0,
                len: this.chunkSize,
                decode_text: true,
            }) as Promise<string>;
            await this.conn.send("file", startMessage);
        } catch (e: any) {
            this.onError(`Failed to send start command: ${e.message}`, 0);
            this.busy = false;
        }
    }

    private async sendNextChunk(currentChunk: number, isReSend: boolean = false) {
        if (currentChunk > this.totalChunk) {
            console.log("All chunks sent. Waiting for final 'success' confirmation from peer.");
            return;
        }

        const chunk = await this.nextChunk;
        const message: DataChunkData = {
            stat: "d",
            count: currentChunk,
            data: chunk,
            setCount: isReSend ? currentChunk : null,
        };

        const currentTime = Date.now();
        if (this.lastChunkTime !== 0) {
            const timeTakenMs = currentTime - this.lastChunkTime;
            const speed = this.FILE_SIZE / (timeTakenMs / 1000.0);
            const remainingTimeS = (this.totalChunk - currentChunk) * (timeTakenMs / 1000.0);
            this.onProgress(
                currentChunk / this.totalChunk,
                ` ${formatBytes(speed)}/s, ${Math.round(remainingTimeS)}s`
            );
        } else {
            this.onProgress(currentChunk / this.totalChunk, " --");
        }
        this.lastChunkTime = currentTime;

        if(currentChunk < this.totalChunk)this.nextChunk = AstroBox.filesystem.readFile(this.curFile, {
            offset: (currentChunk + 1) * this.chunkSize,
            len: this.chunkSize,
            decode_text: true,
        }) as Promise<string>;

        this.conn.send("file", message).catch(e => {
            this.onError(`Failed to send chunk #${currentChunk}: ${e.message}`, currentChunk);
            this.busy = false;
        });
    }

    /**
     * Cancels the current transfer.
     */
    public cancel() {
        if (!this.busy) return;

        this.busy = false;
        const message: CancelData = { stat: "cancel" };

        this.conn.send("file", message).catch(e => {
            console.error("Failed to send cancel message", e);
        });
        //this.onSuccess("Transfer cancelled by user.", 0);
    }
}