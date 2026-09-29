# Syntolk

Статический лендинг Syntolk. Главная страница находится в `index.html`; сборка и установка пакетов не нужны. Для публикации загрузите содержимое репозитория в корень сайта.

В репозитории находятся семь сфер с двумя исходными вопросами для каждой, восемь карточек с фотографиями, адаптивные стили и тарифы. Шрифт Onest расположен в `fonts/onest`; его лицензия — `fonts/onest/OFL.txt`. Источники фотографий указаны в `images/cases/REAL_PHOTOS.md`.

## Как вернуться к исходной версии

Первую загруженную версию сохраняет ветка `rollback/initial-site-2026-09-29`. История `main` также сохраняет все последующие коммиты. Чтобы восстановить эту версию после будущих изменений без переписывания истории, выполните в чистой рабочей копии:

```bash
git fetch origin
git switch main
git pull --ff-only
git restore --source origin/rollback/initial-site-2026-09-29 --staged --worktree .
git diff --cached
git commit -m "Restore initial Syntolk site"
git push origin main
```
