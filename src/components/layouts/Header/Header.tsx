import './Header.css'

import { BsSunFill } from 'react-icons/bs'
import { FaMoon } from 'react-icons/fa'
import { Link } from 'react-router-dom'

import useTheme from '@/hooks/useTheme'
import { APP_ROUTES } from '@/routes/route'

const HeaderItem: React.FC = () => {
  return (
    <div className="header-items">
      {APP_ROUTES.filter(item => item.showInNav).map(item => (
        <Link
          className="header-item"
          key={item.key}
          to={item.path}
        >
          {item.label}
        </Link>
      ))}
    </div>
  )
}

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      className={`theme-toggle ${theme === 'dark' ? 'active' : ''}`}
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle theme"
    >
      <span className="theme-toggle-thumb">
        {theme === 'light' ? <BsSunFill /> : <FaMoon />}
      </span>
    </button>
  )
}

const LayoutHeader: React.FC = () => {
  return (
    <header className="header-area">
      <HeaderItem />

      <ThemeToggle />
    </header>
  )
}

export default LayoutHeader
