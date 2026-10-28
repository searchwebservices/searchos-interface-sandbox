import { createContext, useContext } from 'react'

// The one universal search modal lives in the shell; any header can open it.
export const SearchContext = createContext<{ open: () => void }>({ open: () => {} })
export const useSearch = () => useContext(SearchContext)
