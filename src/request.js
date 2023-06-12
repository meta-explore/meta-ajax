import { urlAppend,isAFormData,toQueryString } from './utils'

const context = window
const doc = document
const byTag = 'getElementsByTagName'
const head = doc[byTag]('head')[0]
const httpsRe = /^http/
const protocolRe = /(^\w+):\/\//
const twoHundo = /^(20\d|1223)$/ // http://stackoverflow.com/questions/10046972/msie-returns-status-code-of-1223-for-ajax-request
const readyState = 'readyState'
const contentType = 'Content-Type'
const requestedWith = 'X-Requested-With'
const callbackPrefix = 'request_' + + new Date()
const xmlHttpRequest = 'XMLHttpRequest'
const xDomainRequest = 'XDomainRequest'
let uuid = 0
let lastValue = undefined // data stored by the most recent JSONP callback

const noop = function(){}

const getCallbackPrefix = function(reqId){
    return callbackPrefix + '_' + reqId
}

const xhr = function(o){
    const ctx = o.context || context
    // is it x-domain
    if (o.crossOrigin === true) {
        const xhrInstance = ctx[xmlHttpRequest] ? new ctx[xmlHttpRequest]() : null
        if (xhrInstance && 'withCredentials' in xhrInstance) {
            return xhrInstance
        }
        if (ctx[xDomainRequest]) {
            return new ctx[xDomainRequest]()
        }
        throw new Error('Browser does not support cross-origin requests')
    } else if (ctx[xmlHttpRequest]) {
        return new ctx[xmlHttpRequest]()
    } else {
        return new ctx.ActiveXObject('Microsoft.XMLHTTP')
    }
}

const globalSetupOptions = {
    traditional: false,
    'contentType': 'application/x-www-form-urlencoded',
    'requestedWith': xmlHttpRequest,
    'accept': {
        '*': 'text/javascript, text/html, application/xml, text/xml, */*',
        'xml': 'application/xml, text/xml',
        'html': 'text/html',
        'text': 'text/plain',
        'json': 'application/json, text/javascript',
        'js': 'application/javascript, text/javascript'
    },
    dataFilter: function(data){
        return data
    }
};

const succeed =function(r){
    const protocol = protocolRe.exec(r.url)
    let protocolString = ''
    if (protocol) {
        protocolString = protocol[1]
    }
    if (!protocolString) {
        protocolString = (r.o.context || context).location.protocol
    }
    return httpsRe.test(protocolString) ? twoHundo.test(r.request.status) : !!r.request.response
}

const handleReadyState = function(r, success, error){
    return function () {
        // use _aborted to mitigate against IE err c00c023f
        // (can't read props on aborted request objects)
        if (r._aborted) {
            return error('Request is aborted', r.request)
        }
        if (r._timedOut) {
            return error('Request is aborted: timeout', r.request)
        }
        if (r.request && r.request[readyState] === 4) {
            r.request.onreadystatechange = noop
            if (succeed(r)) {
                success(r.request)
            } else {
                error(r.request.statusText, r.request)
            }
        }
    }
}

const setHeaders = function(http, o){
    const headers = o.headers || {}
    let h = undefined
    headers.Accept = headers.Accept || globalSetupOptions.accept[o.type] || globalSetupOptions.accept['*']
    // breaks cross-origin requests with legacy browsers
    if (!o.crossOrigin && !headers[requestedWith]) {
        headers[requestedWith] = globalSetupOptions.requestedWith
    }
    if (!headers[contentType] && !isAFormData(o.data)) {
        headers[contentType] = o.contentType || globalSetupOptions.contentType
    }
    for (h in headers) {
        if (headers.hasOwnProperty(h) && 'setRequestHeader' in http) {
            http.setRequestHeader(h, headers[h])
        }
    }
}

const setCredentials = function(http, o){
    if (typeof o.withCredentials !== 'undefined' && typeof http.withCredentials !== 'undefined') {
        http.withCredentials = !!o.withCredentials
    }
}

const generalCallback = function(data){
    lastValue = data
}

function handleJsonp(o, fn, error, url_) {
    let url = url_
    const reqId = uuid++
    const cbkey = o.jsonpCallback || 'callback' // the 'callback' key
    let cbval = o.jsonpCallbackName || getCallbackPrefix(reqId)
    const cbreg = new RegExp('((^|\\?|&)' + cbkey + ')=([^&]+)')
    const match = url.match(cbreg)
    const script = doc.createElement('script')
    let loaded = 0
    const isIE10 = navigator.userAgent.indexOf('MSIE 10.0') !== -1

    if (match) {
        if (match[3] === '?') {
            url = url.replace(cbreg, '$1=' + cbval) // wildcard callback func name
        } else {
            cbval = match[3] // provided callback func name
        }
    } else {
        url = urlAppend(url, cbkey + '=' + cbval) // no callback details, add 'em
    }

    context[cbval] = generalCallback

    script.type = 'text/javascript'
    script.src = url
    script.async = true
    if (typeof script.onreadystatechange !== 'undefined' && !isIE10) {
        // need this for IE due to out-of-order onreadystatechange(), binding script
        // execution to an event listener gives us control over when the script
        // is executed. See http://jaubourg.net/2010/07/loading-script-as-onclick-handler-of.html
        script.htmlFor = script.id = '_request_' + reqId
    }

    script.onload = script.onreadystatechange = function(){
        if (script[readyState] && script[readyState] !== 'complete' && script[readyState] !== 'loaded' || loaded) {
            return false
        }
        script.onload = script.onreadystatechange = null
        if (script.onclick) {
            script.onclick()
        }
        // Call the user callback with the last value stored and clean up values and scripts.
        fn(lastValue)
        lastValue = undefined
        head.removeChild(script)
        loaded = 1
    }

    // Add the script to the DOM head
    head.appendChild(script)

    // Enable JSONP timeout
    return {
        abort:function(){
            script.onload = script.onreadystatechange = null
            error('Request is aborted: timeout')
            lastValue = undefined
            head.removeChild(script)
            loaded = 1
        }
    }
}

const getRequest = function(fn, error) {
    const o = this.o;
    const method = (o.method || 'GET').toUpperCase()
    let url = typeof o === 'string' ? o : o.url;
    // convert non-string objects to query-string form unless o.processData is false
    let data = o.processData !== false && o.data && typeof o.data !== 'string' && !isAFormData(o.data) ? toQueryString(o.data, o.traditional || globalSetupOptions.traditional) : o.data || null
    let http = undefined
    let sendWait = false

    // if we're working on a GET request and we have data then we should append
    // query string to end of URL and not post data
    if ((o.type === 'jsonp' || method === 'GET') && data) {
        url = urlAppend(url, data)
        data = null
    }

    if (o.type === 'jsonp') {
        return handleJsonp(o, fn, error, url)
    }

    // get the xhr from the factory if passed
    // if the factory returns null, fall-back to ours
    http = o.xhr && o.xhr(o) || xhr(o)
    http.open(method, url, o.async === false ? false : true)
    setHeaders(http, o)
    setCredentials(http, o)
    if (context[xDomainRequest] && http instanceof context[xDomainRequest]) {
        http.onload = fn
        http.onerror = function() {
            error('http error', http)
        }
        // NOTE: see
        // http://social.msdn.microsoft.com/Forums/en-US/iewebdevelopment/thread/30ef3add-767c-4436-b8a9-f1ca19b4812e
        http.onprogress = noop
        sendWait = true
    } else {
        http.onreadystatechange = handleReadyState(this, fn, error)
    }
    if (o.before) {
        o.before(http)
    }
    if (sendWait) {
        setTimeout(function(){
            http.send(data)
        }, 200)
    } else {
        http.send(data)
    }
    return http
}

const Request = function() {
    this.initPromise()
}

const request = function() {
    return new Request()
}

const setType = function(header){
    // json, javascript, text/plain, text/html, xml
    if (!header) {
        return undefined
    }
    if (header.match('json')) {
        return 'json'
    }
    if (header.match('javascript')) {
        return 'js'
    }
    if (header.match('text')) {
        return 'html'
    }
    if (header.match('xml')) {
        return 'xml'
    }
}

const init = function(o) {
    const self = this
    const timedOut = function(){
        self._timedOut = true
        self.request.abort()
    }

    this.url = typeof o === 'string' ? o : o.url

    if (this.timeout) {
        clearTimeout(this.timeout)
    }

    this.timeout = null

    if (o.timeout) {
        this.timeout = setTimeout(timedOut, o.timeout)
    }

    const error = function(msg, xhr_){
        self.triggerError(msg, xhr_)
    }

    const success = function(resp_){
        self.triggerSuccess(resp_)
    }
    this.request = getRequest.call(this, success, error)
}

Request.prototype = {
    triggerSuccess: function(resp_){
        const o = this.o
        let resp = resp_
        let type = o.type
        // use global data filter on response text
        const r = (o.dataFilter || globalSetupOptions.dataFilter)(resp.responseText, type)
        if (!type) {
            type = resp && setType(resp.getResponseHeader('Content-Type'))
        } 
        // resp can be undefined in IE
        resp = type !== 'jsonp' ? this.request : resp
        try {
            resp.responseText = r
        } catch (e) {
        // can't assign this in IE<=8, just ignore
        }
        if (r) {
            switch (type) {
                case 'json':
                try {
                    resp = context.JSON.parse(r)
                } catch (err) {
                    return this.triggerError('Could not parse JSON in response', resp)
                }
                break
                case 'html':
                resp = r
                break
                case 'xml':
                resp = resp.responseXML && resp.responseXML.parseError && resp.responseXML.parseError.errorCode && resp.responseXML.parseError.reason ? null : resp.responseXML;
                break
                default:
                break
            }
        }

        if (o.success) {
            o.success(resp)
        }
        this.triggerComplete(resp)
        this.__resolve(resp)
    },
    triggerError: function(msg, xhr_) {
        const o = this.o
        const e = new Error(msg)
        e.xhr = xhr_
        if (o.error) {
            o.error(e)
        }
        this.triggerComplete(e)
        this.__reject(e)
    },
    triggerComplete:function(resp) {
        const o = this.o
        if (o.timeout) {
            clearTimeout(this.timeout)
        }
        this.timeout = null
        if (o.complete) {
            o.complete(resp)
        }
    },
    initPromise: function() {
        const self = this
        self.promise = new Promise(function(resolve, reject){
            self.__resolve = resolve
            self.__reject = reject
        }).catch(() => {})
    },
    abort: function() {
        this._aborted = true
        this.request.abort()
    },
    retry: function() {
        this.initPromise()
        init.call(this, this.o)
    },
    then: function(success, fail) {
        return this.promise.then(success, fail)
    },
    always: function(fn) {
        return this.promise.then(fn, fn)
    },
    fail: function(fn) {
        return this.promise.then(undefined, fn)
    },
    'catch':function(fn) {
        return this.fail(fn)
    },
    setup: function(o_) {
        this.o = Object.assign({}, globalSetupOptions, o_)
    },
    start: function(o_) {
        this.setup(o_)
        init.call(this, this.o)
    }
}

request.ajaxSetup = function () {
    const options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0]
    for (let k in options) {
        if (options.hasOwnProperty(k) && globalSetupOptions.hasOwnProperty(k)) {
            globalSetupOptions[k] = options[k]
        }
    }
};

export default request
