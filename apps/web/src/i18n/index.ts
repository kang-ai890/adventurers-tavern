import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  resources: {
    zh: {
      translation: {
        "wake.title": "正在唤醒酒馆…",
        "wake.body": "免费服务器在无人时休眠，冷启动约需 1 分钟，请稍候。",
        "wake.connecting": "连接中…",
        "login.title": "进入酒馆",
        "login.nickname": "道号（昵称）",
        "login.guest": "以游客身份进入",
        "login.register": "注册账号（可选）",
        "hud.stones": "灵石",
        "hud.jades": "仙玉",
        "hud.energy": "体力",
        "hud.realm": "境界",
        "chat.placeholder": "说点什么…（回车发送）",
      },
    },
  },
  lng: "zh",
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
});

export default i18n;
