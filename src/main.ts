import { createApp } from 'vue'
import { createPinia } from 'pinia'
import naive from 'naive-ui'

import App from './App.vue'
import router from './router'
import './assets/main.css'
import { iconAliases } from './icons/xicons'

const app = createApp(App)

for (const [key, component] of Object.entries(iconAliases)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(naive)

app.mount('#app')
