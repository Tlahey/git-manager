import { create } from 'zustand'

interface FileExplorerState {
  isOpen: boolean
  isSidebarOpen: boolean
  selectedFilePath: string | null
  currentDirPath: string
  treeSearchQuery: string
  actions: {
    toggleOpen: () => void
    toggleSidebar: () => void
    setIsOpen: (isOpen: boolean) => void
    setSelectedFilePath: (path: string | null) => void
    setCurrentDirPath: (path: string) => void
    setTreeSearchQuery: (query: string) => void
  }
}

export const useFileExplorerStore = create<FileExplorerState>((set) => ({
  isOpen: false,
  isSidebarOpen: true,
  selectedFilePath: null,
  currentDirPath: '',
  treeSearchQuery: '',
  actions: {
    toggleOpen: () =>
      set((state) => ({
        isOpen: !state.isOpen,
        selectedFilePath: !state.isOpen ? null : state.selectedFilePath,
      })),
    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    setIsOpen: (isOpen) =>
      set((state) => ({
        isOpen,
        selectedFilePath: isOpen ? null : state.selectedFilePath,
        currentDirPath: isOpen ? '' : state.currentDirPath,
      })),
    setSelectedFilePath: (path) => set({ selectedFilePath: path }),
    setCurrentDirPath: (path) => set({ currentDirPath: path, selectedFilePath: null }),
    setTreeSearchQuery: (query) => set({ treeSearchQuery: query }),
  },
}))
