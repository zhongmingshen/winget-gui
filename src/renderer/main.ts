import { createApp } from "vue";
import App from "./App.vue";
import "ant-design-vue/dist/antd.css";
import "./styles.scss";
import Antd from "ant-design-vue";
import * as Icons from "@ant-design/icons-vue";
import i18n from "./i18n";

const app = createApp(App);
app.use(Antd);
app.use(i18n);

// register icons globally
Object.entries(Icons).forEach(([k, v]) => {
  // @ts-ignore
  app.component(k, v);
});

app.mount("#app");
