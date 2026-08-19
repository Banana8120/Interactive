import { createDiscreteApi, darkTheme, lightTheme, zhCN, dateZhCN } from 'naive-ui'

const { message, dialog } = createDiscreteApi(['message', 'dialog'], {
  configProviderProps: {
    locale: zhCN,
    dateLocale: dateZhCN,
    theme: lightTheme,
    themeOverrides: {
      common: {
        primaryColor: '#2496ED',
        primaryColorHover: '#1b86d8',
        primaryColorPressed: '#1669ad'
      }
    }
  }
})

export { message, dialog, lightTheme, darkTheme, zhCN, dateZhCN }

export interface ConfirmOptions {
  confirmText?: string
  cancelText?: string
  confirmButtonText?: string
  cancelButtonText?: string
  type?: 'warning' | 'error' | 'success' | 'info'
}

export function confirmDialog(content: string, title: string, options: ConfirmOptions = {}) {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const closeAsCancel = () => {
      if (!settled) {
        settled = true
        reject(new Error('cancel'))
      }
    }

    dialog[options.type || 'warning']({
      title,
      content,
      positiveText: options.confirmText || options.confirmButtonText || '确认',
      negativeText: options.cancelText || options.cancelButtonText || '取消',
      onPositiveClick: () => {
        settled = true
        resolve()
      },
      onNegativeClick: closeAsCancel,
      onClose: closeAsCancel,
      onMaskClick: closeAsCancel,
      onEsc: closeAsCancel
    })
  })
}
