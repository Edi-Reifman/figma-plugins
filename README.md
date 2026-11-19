# Плагины ER-Design для Figma

Пять бесплатных плагинов для Figma. Все работают локально: доступ к сети запрещён в манифесте, аналитики и регистрации нет.

| Плагин | Что делает | Версия | Скачать |
|---|---|---|---|
| **ER Layouts** | Создаёт артборды с вылетами, безопасными и слепыми зонами для маркетплейсов, рекламы и печати | 1.0 | [ZIP](https://github.com/Edi-Reifman/figma-plugins/raw/main/downloads/ER-Layouts-1.0.zip) |
| **Smart Resize** | Делает ресайзы баннера по списку размеров и подбирает композицию | 2.0.0 | [ZIP](https://github.com/Edi-Reifman/figma-plugins/raw/main/downloads/Smart-Resize-2.0.0.zip) |
| **Color Lab** | Девять цветокоррекций: Levels, Curves, Hue/Saturation и другие | 1.0.0 | [ZIP](https://github.com/Edi-Reifman/figma-plugins/raw/main/downloads/Color-Lab-1.0.0.zip) |
| **PSD → Figma** | Импортирует PSD со слоями, текстом и векторами, экспортирует Figma → PSD | 0.4.0 beta | [ZIP](https://github.com/Edi-Reifman/figma-plugins/raw/main/downloads/PSD-to-Figma-0.4.0-beta.zip) |
| **PrintPrep** | Делает макеты в миллиметрах, экспортирует CMYK PDF, EPS и TIFF через ICC | 0.5.1 beta | [ZIP](https://github.com/Edi-Reifman/figma-plugins/raw/main/downloads/PrintPrep-0.5.1-beta.zip) |

Все архивы лежат в папке [`downloads/`](downloads), а подробные описания — на лендинге [er-design.space](https://er-design.space).

## Установка

1. Скачайте ZIP и распакуйте его в постоянное место, например «Документы/Figma plugins».
2. Откройте файл в **настольном приложении** Figma. В браузерной версии импорт не работает.
3. Выберите в меню **Plugins → Development → Import plugin from manifest…**
4. Укажите `manifest.json` из распакованной папки.
5. Запускайте плагин через **Plugins → Development**.

**Обновление.** Закройте плагин и замените файлы в той же папке новыми. Наборы и пресеты сохранятся.

## Папка `plugins/`

Здесь лежат те же файлы, что и в архивах: их можно посмотреть прямо на GitHub. Для установки удобнее брать ZIP из `downloads/`.

## Лицензии

- **PrintPrep** распространяется по GNU AGPLv3 и включает Ghostscript (AGPL) и pdf-lib (MIT). Исходники: [PrintPrep-source-0.5.1-rc.1.zip](https://github.com/Edi-Reifman/figma-plugins/raw/main/downloads/PrintPrep-source-0.5.1-rc.1.zip).
- **PSD → Figma**: уведомления о сторонних библиотеках находятся в `THIRD_PARTY_NOTICES.txt`.
- **Smart Resize**: MIT, см. `LICENSE`.
- **Color Lab**, **ER Layouts**: бесплатны для использования, все права на код принадлежат автору (см. `NOTICE.txt`).

## Поддержка

Пишите на info@er-design.space. Укажите плагин, версию Figma и приложите скриншот.

Плагины бесплатные. Если хотите поддержать разработку: [paypal.me/edireifman](https://paypal.me/edireifman)
