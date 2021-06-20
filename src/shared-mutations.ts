import type { IpcMain, IpcRenderer } from "electron"
import type { Store } from "vuex"

const IPC_EVENT_CONNECT = "vuex-mutations-connect"
/** channel for triggering an action in main, from renderer */
const IPC_EVENT_NOTIFY_MAIN_ACTION = "vuex-mutations-notify-main-action"
/** channel for triggering a mutation in main, from renderer */
const IPC_EVENT_NOTIFY_MAIN_MUTATION = "vuex-mutations-notify-main-commit"
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

  notifyMain(payload): Promise<any> {
    return this.options.ipcRenderer.invoke(IPC_EVENT_NOTIFY_MAIN_ACTION, payload)
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

    this.store.commit = (...args) => {
      const errorMsg = this.options.ipcRenderer.sendSync(IPC_EVENT_NOTIFY_MAIN_MUTATION, ...args)
      if (errorMsg) {
        throw Error(`[Vuex Electron] Error from main process while applying commit: ${errorMsg}`)
      }
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

    // Subscribe to action dispatch from renderer processes
    this.options.ipcMain.handle(IPC_EVENT_NOTIFY_MAIN_ACTION, (event, { type, payload }) => {
      return this.store.dispatch(type, payload)
    })

    // Subscribe to mutations requested from renderer processes
    this.options.ipcMain.on(IPC_EVENT_NOTIFY_MAIN_MUTATION, (event, ...args: Parameters<Store<any>["commit"]>) => {
      let errorMsg = ""
      try {
        this.store.commit(...args)
      } catch (err) {
        errorMsg = err.message
      }
      event.returnValue = errorMsg
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
