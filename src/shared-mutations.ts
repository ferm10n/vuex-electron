import type { IpcMain, IpcRenderer } from "electron"
import type { Store } from "vuex"

const IPC_EVENT_CONNECT = "vuex-mutations-connect"
const IPC_EVENT_NOTIFY_MAIN = "vuex-mutations-notify-main"
const IPC_EVENT_NOTIFY_RENDERERS = "vuex-mutations-notify-renderers"

/**
 * @type {import('../types').SharedMutations}
 */
class SharedMutations {
  options: {
    type: "renderer" | "main"
    ipcMain: IpcMain
    ipcRenderer: IpcRenderer
  }

  store: Store<any>

  constructor(options, store: Store<any>) {
    this.options = options
    if (!this.options.type) {
      this.options.type = process.type === "renderer" ? "renderer" : "main"
    }

    if (
      (this.options.type === "renderer" && !this.options.ipcRenderer) ||
      (this.options.type === "main" && !this.options.ipcMain)
    ) {
      const { ipcMain, ipcRenderer } = require("electron")
      if (!this.options.ipcMain) this.options.ipcMain = ipcMain
      if (!this.options.ipcRenderer) this.options.ipcRenderer = ipcRenderer
    }

    this.store = store
  }

  connect() {
    this.options.ipcRenderer.send(IPC_EVENT_CONNECT)
  }

  onConnect(handler) {
    this.options.ipcMain.on(IPC_EVENT_CONNECT, handler)
  }

  async notifyMain(payload) {
    return await this.options.ipcRenderer.invoke(IPC_EVENT_NOTIFY_MAIN, payload)
  }

  onNotifyMain(handler) {
    this.options.ipcMain.handle(IPC_EVENT_NOTIFY_MAIN, handler)
  }

  notifyRenderers(connections, payload) {
    Object.keys(connections).forEach((processId) => {
      connections[processId].send(IPC_EVENT_NOTIFY_RENDERERS, payload)
    })
  }

  onNotifyRenderers(handler) {
    this.options.ipcRenderer.on(IPC_EVENT_NOTIFY_RENDERERS, handler)
  }

  rendererProcessLogic() {
    // Connect renderer to main process
    this.connect()

    // Save original Vuex methods
    const originalCommit = this.store.commit
    // const originalDispatch = this.store.dispatch

    // Don't use commit in renderer outside of actions
    this.store.commit = () => {
      throw new Error(`[Vuex Electron] Please, don't use direct commit's, use dispatch instead of this.`)
    }

    // Forward dispatch to main process
    this.store.dispatch = (type, payload) => {
      return this.notifyMain({ type, payload })
    }

    // Subscribe on changes from main process and apply them
    this.onNotifyRenderers((event, { type, payload }) => {
      originalCommit.call(this.store, type, payload)
    })
  }

  mainProcessLogic() {
    const connections = {}

    // Save new connection
    this.onConnect((event) => {
      const win = event.sender
      const winId = win.id

      connections[winId] = win

      // Remove connection when window is closed
      win.on("destroyed", () => {
        delete connections[winId]
      })
    })

    // Subscribe on changes from renderer processes
    this.onNotifyMain(async (event, { type, payload }) => {
      return await this.store.dispatch(type, payload)
    })

    // Subscribe on changes from Vuex store
    this.store.subscribe((mutation) => {
      const { type, payload } = mutation

      // Forward changes to renderer processes
      this.notifyRenderers(connections, { type, payload })
    })
  }

  activatePlugin() {
    switch (this.options.type) {
      case "renderer":
        this.rendererProcessLogic()
        break
      case "main":
        this.mainProcessLogic()
        break
      default:
        throw new Error(`[Vuex Electron] Type should be "renderer" or "main".`)
    }
  }
}

export default (options: Partial<SharedMutations["options"]> = {}) =>
  (store) => {
    const sharedMutations = new SharedMutations(options, store)

    sharedMutations.activatePlugin()
  }
