import AstroBox, { PickFileReturn } from "astrobox-plugin-sdk";
import InterHandshake from "./handshake";
import InterFile from "./sendFile";
import { formatBytes, getFileName } from "./utils";

let interconn:InterHandshake
let fileSender:InterFile

let file : PickFileReturn;
const pickFile = AstroBox.native.regNativeFun(()=>onPick())
const sendFile = AstroBox.native.regNativeFun(()=>handleSend())
const cancelSend = AstroBox.native.regNativeFun(()=>handleCancelSend())
const ui = [
    {
        node_id: "pickFile",
        visibility: true,
        disabled: false,
        content: {
            type: "Button",
            value: {
                primary: true,
                text: "选择文件",
                callback_fun_id: pickFile
            }
        }
    }, {
        node_id: "send",
        visibility: true,
        disabled: true,
        content: {
            type: "Button",
            value: {
                primary: true,
                text: "发送文件",
                callback_fun_id: sendFile
            }
        }
    }, {
        node_id: "filename",
        visibility: true,
        disabled: false,
        content: {
            type: "Text",
            value: `未选择文件`
        }
    }, {
        node_id: "fuck",
        visibility: true,
        disabled: false,
        content: {
            type: "Text",
            value: `可能因为未知原因失败，多试试`
        }
    }
]
AstroBox.lifecycle.onLoad(() => {
    console.log("Plugin on LOAD!")
    //@ts-ignore
    AstroBox.ui.updatePluginSettingsUI(ui)
    interconn = new InterHandshake("com.bandbbs.ebook")
    fileSender = new InterFile(interconn);
})
async function onPick() {
    try {
        if(file?.path)await AstroBox.filesystem.unloadFile(file.path)
    } catch (error) {
        console.error(error)
        //@ts-ignore
        ui[2].content.value = error.message
        //@ts-ignore
        AstroBox.ui.updatePluginSettingsUI(ui)
    }
    file = await AstroBox.filesystem.pickFile({
        decode_text: true,
    })
    ui[2]={
        node_id: "filename",
        visibility: true,
        disabled: false,
        content: {
            type: "Text",
            value: `${getFileName(file.path)}\n${formatBytes(file.size)}`
        }
    }
    ui[1].disabled = false
    //@ts-ignore
    AstroBox.ui.updatePluginSettingsUI(ui)
}
async function handleSend() {
    if (!file) return
    ui[0].disabled = true
    //@ts-ignore
    ui[1].content.value.text = "取消"
    //@ts-ignore
    ui[1].content.value.callback_fun_id = cancelSend
    //@ts-ignore
    AstroBox.ui.updatePluginSettingsUI(ui)
    try {
        const appList = await AstroBox.thirdpartyapp.getThirdPartyAppList()
        const app = appList.find(app=>app.package_name=="com.bandbbs.ebook")
        if(!app){
            ui[2].content.value = "请先安装BandBBS客户端"
            //@ts-ignore
            return AstroBox.ui.updatePluginSettingsUI(ui)
        }
        await AstroBox.thirdpartyapp.launchQA(app, "com.bandbbs.ebook")
        await new Promise(resolve => setTimeout(resolve, 1000))
        await fileSender.sendFile(getFileName(file.path),file.path,file.size,file.text_len,onprogress,onsuccess,onerror)
    } catch (error) {
        console.error(error)
        //@ts-ignore
        ui[2].content.value = error.message
        //@ts-ignore
        AstroBox.ui.updatePluginSettingsUI(ui)
    }
}
async function handleCancelSend() {
    fileSender.cancel()
    ui[0].disabled = false
    //@ts-ignore
    ui[1].content.value.text = "发送文件"
    //@ts-ignore
    ui[1].content.value.callback_fun_id = sendFile
    //@ts-ignore
    AstroBox.ui.updatePluginSettingsUI(ui)
}
function onprogress(progress: number, status: string) {
    ui[2].content.value = `${status} ${(progress*100).toFixed(2)}%`
    //@ts-ignore
    AstroBox.ui.updatePluginSettingsUI(ui)
}
function onsuccess() {
    ui[2].content.value = "发送成功"
    //@ts-ignore
    AstroBox.ui.updatePluginSettingsUI(ui)
}
function onerror() {
    ui[2].content.value = "发送失败"
    //@ts-ignore
    AstroBox.ui.updatePluginSettingsUI(ui)
}
