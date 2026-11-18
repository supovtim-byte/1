# Откат обновления от 19 ноября 2026

Версия перед изменением шапки, каталога врачей и добавлением лечения во сне:

- Коммит: `28285220fa57b5220dbfd3d2efb96fc0e968e8db`.
- Резервная ветка: `backup/before-menus-doctors-sleep-20261119`.

Обновление сохранено одним коммитом с названием `Update shared menus, doctor catalog and sleep treatment page`.

Чтобы отменить именно это обновление с сохранением истории:

1. Получите актуальную ветку `main`: `git switch main`, затем `git pull --ff-only origin main`.
2. Найдите SHA обновления: `git log --oneline --grep='Update shared menus, doctor catalog and sleep treatment page'`.
3. Выполните `git revert SHA`, подставив SHA обновления. Если после него были другие правки тех же строк, разрешите конфликты с сохранением нужных новых изменений.
4. Выполните `npm run check` и `git push origin main`.

GitHub Actions опубликует отмену через существующий workflow GitHub Pages. `reset --hard` и принудительная отправка ветки не требуются. Резервную ветку можно открыть на GitHub, чтобы посмотреть или скачать прежние файлы.
