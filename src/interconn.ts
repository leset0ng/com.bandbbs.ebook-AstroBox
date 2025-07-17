import AstroBox from "astrobox-plugin-sdk";
export default class interconnect {
    listeners = new Map<string, ((data: any) => void)>();
    packageName: string;
    constructor(packageName: string) {
        this.packageName = packageName;
        AstroBox.event.addEventListener<string>(`onQAICMessage_${packageName}`, (data) => {
            const { tag, ...payload } = JSON.parse(data);
            this.listeners.get(tag)?.(payload);
        })
    }
    /**
     * @param {string} tag
     * @param {Function} callback
     */
    addListener<T>(tag: string, callback: (data: T) => void) {
        this.listeners.set(tag, callback);
    }
    /**
     * @param {string} tag
     */
    removeListener(tag: string) {
        this.listeners.delete(tag);
    }
    send<T>(tag: string, data: T) {
        return AstroBox.interconnect.sendQAICMessage(this.packageName,JSON.stringify({tag,...data}))
    }
}