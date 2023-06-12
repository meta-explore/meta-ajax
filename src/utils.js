export const TOKEN = 'token'
const isArray = Array.isArray

export const startsWith = (str, prefix) => {
    return str.slice(0, prefix.length) === prefix;
}

export const endsWith = (str, suffix) => {
    return str.slice(-suffix.length) === suffix;
}

export const getTokenFromCookie = (win) => {
    const cookieParts = win.document.cookie.split(/;\s/g)
    for (let i = 0, len = cookieParts.length; i < len; i++) {
        const cookieNameValue = cookieParts[i].match(/([^=]+)=/i)
        if (cookieNameValue && cookieNameValue[1] === TOKEN) {
            return cookieParts[i].substring(cookieNameValue[1].length + 1)
        }
    }
}

export const buildParams = (prefix, obj, traditional, add) => {
    let name = undefined
    let i = undefined
    let v = undefined
    const rbracket = /\[\]$/

    if (isArray(obj)) {
        // Serialize array item.
        for (i = 0; obj && i < obj.length; i++) {
            v = obj[i]
            if (traditional || rbracket.test(prefix)) {
                // Treat each array item as a scalar.
                add(prefix, v)
            } else {
                buildParams(prefix + '[' + ((typeof v === 'undefined' ? 'undefined' : typeof v) === 'object' ? i : '') + ']', v, traditional, add)
            }
        }
    } else if (obj && obj.toString() === '[object Object]') {
        // Serialize object item.
        for (name in obj) {
            if (obj.hasOwnProperty(name)) {
                buildParams(prefix + '[' + name + ']', obj[name], traditional, add)
            }
        }
    } else {
        // Serialize scalar item.
        add(prefix, obj)
    }
}

export const urlAppend = (url, s) => {
    return url + (/\?/.test(url) ? '&' : '?') + s
}

export const toQueryString = (o, trad) => {
    let prefix = undefined
    let i = undefined
    const traditional = trad || false
    let s = []
    const enc = encodeURIComponent

    const add = (key, value) => {
        let v = value
        // If value is a function, invoke it and return its value
        if (typeof value === 'function') {
            v = value()
        } else if (value === null || value === undefined) {
            v = ''
        }
        s[s.length] = enc(key) + '=' + enc(v)
    }

    // If an array was passed in, assume that it is an array of form elements.
    if (isArray(o)) {
        for (i = 0; o && i < o.length; i++) {
            add(o[i].name, o[i].value)
        }
    } else {
        // If traditional, encode the "old" way (the way 1.3.2 or older
        // did it), otherwise encode params recursively.
        for (prefix in o) {
            if (o.hasOwnProperty(prefix)) {
                buildParams(prefix, o[prefix], traditional, add)
            }
        }
    }
    // spaces should be + according to spec
    return s.join('&').replace(/%20/g, '+')
}

export const isAFormData = data => {
    return typeof FormData !== 'undefined' && data instanceof FormData
}
