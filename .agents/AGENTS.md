# Rules for File and Component Logic Splitting

To ensure long-term codebase readability, ease of maintenance, and testability, please adhere strictly to the following project-scoped organization rules:

- **1 Feature = 1 Component**: Every react file should export a single primary feature/component. Do not nest massive helper/sub-components (like rows, cards, or sections) inside a parent page file if they represent distinct logical features.
- **Split Sub-Components to logical folders**: Split any logical child component (e.g. `RepoRow`, `ReadmePanel`, settings tabs/sections) into a local `components/` directory (e.g. `apps/desktop/src/app/dashboard/components/`).
- **Group API & Tauri Calls**: Do not invoke raw HTTP endpoints or backend Tauri IPC methods directly inside component files. Move all API/backend logic into dedicated wrapper files in `apps/desktop/src/api/` named by service/domain (e.g., `api/repo.api.ts`, `api/github.api.ts`, `api/theme.api.ts`).
- **Use SWR for Data Queries**: For any query/GET requests or data fetching operations (Tauri commands or HTTP calls), use SWR hooks (`useSWR`) instead of inline `useEffect` state synchronization. Place these hooks under `apps/desktop/src/hooks/`.
- **No Browser Testing / Tauri Exclusivity**: Do not attempt to test, navigate, or verify the application inside Google Chrome (via a browser agent/subagent) because it is a Tauri desktop application. The frontend relies heavily on native Tauri IPC commands which fail or crash when executed in a standard browser environment.
- **Use `data-testid` for easier debugging**: Add `data-testid` attributes with descriptive label values to key interactive, dynamic, or structural UI elements (like buttons, links, inputs, rows, panels, etc.) to make locating and debugging elements much easier.
