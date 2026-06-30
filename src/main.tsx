import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { NotebookView } from './components/NotebookView'
import './index.css'

// Notebook windows load the same renderer with ?notebook=<id> — detect and route.
const notebookId = new URLSearchParams(window.location.search).get('notebook')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {notebookId ? <NotebookView notebookId={notebookId} /> : <App />}
  </React.StrictMode>
)
