import { EnhancementProvider } from './context/EnhancementContext'
import { ThemeProvider } from './context/ThemeContext'
import FileUpload from './components/FileUpload'
import TaskStatus from './components/TaskStatus'
import ThemeToggle from './components/ThemeToggle'

export default function App() {
  return (
    <ThemeProvider>
      <EnhancementProvider>
      <div className="app-shell d-flex flex-column min-vh-100">
        <header className="app-header py-3 border-bottom">
          <div className="container d-flex flex-column flex-md-row align-items-center justify-content-between gap-3">
            <div>
              <div className="app-brand">
                <div className="app-brand-mark">IE</div>
                <div>
                  <h3 className="mb-1">Image Enhancement</h3>
                </div>
              </div>
            </div>
            <div className="d-flex align-items-center gap-3">
              <div className="text-end text-secondary small">
                <div>Обработка изображений.</div>
                <div>Загрузите, настройте и скачайте за пару секунд.</div>
              </div>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="container flex-grow-1 py-5">
          <div className="row g-4">
            <div className="col-12 col-md-5">
              <div className="card h-100 shadow-sm rounded-4">
                <div className="card-body p-4">
                  <FileUpload />
                </div>
              </div>
            </div>
            <div className="col-12 col-md-7">
              <div className="card h-100 shadow-sm rounded-4">
                <div className="card-body p-4">
                  <TaskStatus />
                </div>
              </div>
            </div>
          </div>
        </main>

        <footer className="text-center py-3 mt-auto border-top">
          <div className="container">
            <a href="https://github.com/Vernickitack/vk_education_practice" target="_blank" rel="noopener noreferrer">
              Ссылка на проект
            </a>
            <p className="mb-0" style={{ color: 'var(--text)' }}>&copy; 2026 Image Enhancement.</p>
          </div>
        </footer>
      </div>
    </EnhancementProvider>
    </ThemeProvider>
  )
}
