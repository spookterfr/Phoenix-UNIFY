import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import './App.css'

function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  const items = [
    { path: '/', label: 'home' },
    { path: '/first', label: 'test' },
    { path: '/second', label: 'test' },
    { path: '/third', label: 'test' },
    { path: '/fourth', label: 'test' },
  ]

  return (
    <nav className="bottom-nav">
      <div className="nav-inner">
        {items.map((item) => (
          <button
            key={item.path}
            className={`nav-item ${
              location.pathname === item.path ? 'active' : ''
            }`}
            onClick={() => navigate(item.path)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

function Layout({ children }) {
  return (
    <div className="layout">
      <main className="content">{children}</main>
      <Sidebar />
    </div>
  )
}

function Home() {
  return (
    <Layout>
      <section className="page">
        <h1>Home</h1>
        <p>test.</p>
      </section>
    </Layout>
  )
}

function Test1() {
  return (
    <Layout>
      <section className="page">
        <h1>test</h1>
        <p>Tests.</p>
      </section>
    </Layout>
  )
}

function Test2() {
  return (
    <Layout>
      <section className="page">
        <h1>test</h1>
        <p>Tests.</p>
      </section>
    </Layout>
  )
}

function Test3() {
  return (
    <Layout>
      <section className="page">
        <h1>test</h1>
        <p>test.</p>
      </section>
    </Layout>
  )
}

function Test4() {
  return (
    <Layout>
      <section className="page">
        <h1>test</h1>
        <p>test.</p>
      </section>
    </Layout>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/first" element={<Test1 />} />
        <Route path="/second" element={<Test2 />} />
        <Route path="/third" element={<Test3 />} />
        <Route path="/fourth" element={<Test4 />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App