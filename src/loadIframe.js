const loadedIframe = {
    // "xx.com": {iframe: , callback:[]}
}
export default (url, callback) => {
    let iframeConfig = loadedIframe[url]
    if (iframeConfig) {
        if (iframeConfig.iframe) {
            callback(iframeConfig.error, iframeConfig.iframe)
        } else {
            iframeConfig.callback.push(callback)
        }
        return
    }

    const iframe = document.createElement('iframe')
    iframe.src = url
    iframe.style.position = 'absolute'
    iframe.style.left = '-9999px'
    iframe.style.bottom = 0
    iframe.style.width = 0
    iframe.style.height = 0
    iframe.style.visibility = 'hidden'
    loadedIframe[url] = iframeConfig = {
        callback: [callback]
    }
    iframe.onload = iframe.onerror = () => {
        iframeConfig.iframe = iframe
        let error = undefined
        try {
            /* eslint no-unused-expressions:0 */
            iframe.contentWindow.document
        } catch (e) {
            error = 'proxy page ' + url + ' is not found or document.domain is not set'
            console.error(e)
            console.error(error)
        }
        iframeConfig.error = error
        iframeConfig.callback.forEach(cb => {
            cb(error, iframe)
        });
        delete iframeConfig.callback
    }
    document.body.insertBefore(iframe, null)
}
