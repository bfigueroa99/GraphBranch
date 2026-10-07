# GraphBranch: notas para Claude

App estática (HTML, CSS y JavaScript, sin compilación) que dibuja en vivo las ramas de un repo de GitHub. Commits, pull requests y textos de la interfaz van en español, como el historial. Comprobaciones rápidas antes de subir algo: `node --check` de los archivos tocados y `node tools/check-i18n.mjs` (todo texto nuevo va en los 40 idiomas de `js/locales/`).

## Pull requests y merge

El dueño del repositorio autorizó que Claude abra pull requests y los fusione por su cuenta, sin pedir permiso cada vez:

- Al terminar un cambio verificado, abre el pull request contra `master` desde la rama de trabajo, con título y descripción en español.
- Fusiónalo con squash, con el título del PR seguido de `(#N)` como en el historial, en cuanto esté sin conflictos y sin hilos de revisión pendientes. No hace falta esperar aprobación.
- Si el usuario pidió revisar antes, o el cambio toca algo que él marcó como delicado, espera a que lo diga.
- Los permisos para hacerlo sin confirmaciones están en `.claude/settings.json`.
