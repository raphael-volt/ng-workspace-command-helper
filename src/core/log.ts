import * as colors from "colors";


colors.setTheme({
    silly: 'rainbow',
    input: 'grey',
    verbose: 'cyan',
    prompt: 'grey',
    info: 'green',
    data: 'grey',
    help: 'cyan',
    warn: 'yellow',
    debug: 'blue',
    error: 'red'
})

const log = (message: string, color: ThemeColors = ThemeColors.none) => {
    console.log(logMessage(message, color))
}

enum ThemeColors { none, silly, input, verbose, prompt, info, data, help, warn, debug, error, bold }

const logMessage = (message: string, color: ThemeColors): string => {
    if (color != ThemeColors.none) {
        const prop: string = ThemeColors[color]
        const fn: (message: string) => string = colors[prop]
        return fn(message)
    }
    return message
}

export { ThemeColors, log, logMessage }