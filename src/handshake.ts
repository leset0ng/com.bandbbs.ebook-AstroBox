import AstroBox from 'astrobox-plugin-sdk';
import interconn from './interconn.ts';
//握握手，握握双手
const type = "__hs__"
const TIMEOUT = 3000;

export default class InterHandshake extends interconn {
    promise: Promise<void>|null = null;
    resolve: ((value: void | PromiseLike<void>) => void) | null = null;
    timeout: ReturnType<typeof setTimeout>|null = null;
    constructor(packageName: string) {
        super(packageName);
        AstroBox.event.addEventListener<string>(`onQAICMessage_${packageName}`, (data) => {
            if (this.timeout) clearTimeout(this.timeout);
            this.timeout = setTimeout(() => this.promise = this.resolve = null, TIMEOUT);
            const { tag, ...payload } = JSON.parse(data);
            this.listeners.get(tag)?.(payload);
        })
        this.addListener<{count:number}>(type, ({ count }) => {
            if (count > 0) {
                if (this.promise) {
                    this.resolve?.();
                    this.resolve = null;
                }
                else {
                    this.promise = Promise.resolve()
                    this.callback()
                }
            }
            if (count++ < 2) super.send(type, { count });
        })
    }
    async send<T>(...args: Parameters<typeof interconn.prototype.send<T>>): ReturnType<typeof interconn.prototype.send<T>> {
        if (this.promise) await this.promise;
        else await (this.promise = this._newPromise())
        return await super.send(...args)
    }
    setHandshakeListener(callback: () => void) {
        this.callback= callback
    }
    callback = () => { }
    get connected() { return this.promise !== null }
    _newPromise() {
        return new Promise<void>(( resolve, reject ) => {
            const timeout = setTimeout(() => {
                reject(new Error("timeout"));
                this.promise = this.resolve = null;
            }, TIMEOUT)
            this.resolve = () => {
                resolve()
                clearTimeout(timeout)
            }
            super.send(type, { count: 0 })
        })
    }
}