import merge from "deepmerge"
import type { Store as VuexStore } from "vuex"
import type Store from "electron-store"
import pick from "lodash.pick"
import omit from "lodash.omit"

const STORAGE_NAME = "vuex"
const STORAGE_KEY = "state"
const STORAGE_TEST_KEY = "test"

class PersistedState {
  whitelist: string[]
  blacklist: string[]
  options: {
    /** property paths to filter properties using lodash.pick */
    whitelist?: PersistedState["whitelist"]
    /** property paths to filter properties using lodash.omit */
    blacklist?: PersistedState["blacklist"]
    storage?: Store
    storageKey?: string
    storageName?: string
  }
  store: VuexStore<any>

  constructor(options: PersistedState["options"], store: VuexStore<any>) {
    this.options = options
    this.store = store
  }

  loadOptions() {
    if (!this.options.storage) this.options.storage = this.createStorage()
    if (!this.options.storageKey) this.options.storageKey = STORAGE_KEY

    this.whitelist = this.options.whitelist || []
    this.blacklist = this.options.blacklist || []
  }

  createStorage() {
    const Store = require("electron-store")
    return new Store({ name: this.options.storageName || STORAGE_NAME })
  }

  getState() {
    return this.options.storage.get(this.options.storageKey)
  }

  setState(state) {
    this.options.storage.set(this.options.storageKey, state)
  }

  checkStorage() {
    try {
      this.options.storage.set(STORAGE_TEST_KEY, STORAGE_TEST_KEY)
      this.options.storage.get(STORAGE_TEST_KEY)
      this.options.storage.delete(STORAGE_TEST_KEY)
    } catch (error) {
      console.error(error)
      throw new Error("[Vuex Electron] Storage is not valid. Please, read the docs.")
    }
  }

  combineMerge(target, source, options) {
    const emptyTarget = (value) => (Array.isArray(value) ? [] : {})
    const clone = (value, options) => merge(emptyTarget(value), value, options)
    const destination = target.slice()

    source.forEach(function (e, i) {
      if (typeof destination[i] === "undefined") {
        const cloneRequested = options.clone !== false
        const shouldClone = cloneRequested && options.isMergeableObject(e)
        destination[i] = shouldClone ? clone(e, options) : e
      } else if (options.isMergeableObject(e)) {
        destination[i] = merge(target[i], e, options)
      } else if (target.indexOf(e) === -1) {
        destination.push(e)
      }
    })

    return destination
  }

  loadInitialState() {
    const state = this.getState()

    if (state) {
      const mergedState = merge(this.store.state, state, { arrayMerge: this.combineMerge })
      this.store.replaceState(mergedState)
    }
  }

  subscribeOnChanges() {
    this.store.subscribe((mutation, state) => {
      let filteredState = state
      if (this.whitelist.length > 0) filteredState = pick(state, this.whitelist)
      if (this.blacklist.length > 0) filteredState = omit(state, this.blacklist)

      this.setState(filteredState)
    })
  }
}

export default (options: PersistedState["options"] = {}) =>
  (store) => {
    const persistedState = new PersistedState(options, store)

    persistedState.loadOptions()
    persistedState.checkStorage()
    persistedState.loadInitialState()
    persistedState.subscribeOnChanges()
  }
