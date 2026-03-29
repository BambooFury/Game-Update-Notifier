local logger = require("logger")
local millennium = require("millennium")

local PLUGIN_DIR = debug.getinfo(1, "S").source:match("^@(.+)\\backend\\") or "."
local VERSIONS_FILE = PLUGIN_DIR .. "\\versions.json"

local function read_file(path)
    local f = io.open(path, "r")
    if not f then return nil end
    local c = f:read("*a"); f:close(); return c
end

local function write_file(path, content)
    local f = io.open(path, "w")
    if not f then return end
    f:write(content); f:close()
end
function load_versions_ipc(data)
    local content = read_file(VERSIONS_FILE)
    return content or "{}"
end
function log_tracking(data)
    local payload = data
    if type(data) == "table" then payload = data.payload end
    if payload then
        logger:info("[GameUpdateNotifier] " .. tostring(payload))
    end
    return 1
end
function save_versions_ipc(data)
    local payload = data
    if type(data) == "table" then payload = data.payload end
    if not payload then return 0 end
    write_file(VERSIONS_FILE, payload)
    return 1
end

local function on_load()
    logger:info("[GameUpdateNotifier] Loaded, Millennium " .. millennium.version())
    logger:info("[GameUpdateNotifier] versions.json path: " .. VERSIONS_FILE)
    millennium.ready()
end

local function on_unload()
    logger:info("[GameUpdateNotifier] Unloaded")
end

local function on_frontend_loaded()
    logger:info("[GameUpdateNotifier] Frontend loaded")
end

return {
    on_load = on_load,
    on_unload = on_unload,
    on_frontend_loaded = on_frontend_loaded
}
