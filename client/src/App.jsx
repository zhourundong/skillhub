import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import SkillList from './pages/SkillList';
import SkillDetail from './pages/SkillDetail';
import Channels from './pages/Channels';

export default function App() {
  return (
    <>
      <header className="header">
        <div className="container">
          <h1>🧩 SkillHub</h1>
          <nav>
            <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''}>Skills 管理</NavLink>
            <NavLink to="/channels" className={({ isActive }) => isActive ? 'active' : ''}>发布渠道</NavLink>
          </nav>
        </div>
      </header>
      <main className="container" style={{ paddingTop: 8, paddingBottom: 40 }}>
        <Routes>
          <Route path="/" element={<SkillList />} />
          <Route path="/skills/:id" element={<SkillDetail />} />
          <Route path="/channels" element={<Channels />} />
        </Routes>
      </main>
    </>
  );
}
