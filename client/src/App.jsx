import { useState } from 'react'
import axios from 'axios'
import './App.css'

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [profile, setProfile] = useState({ fullName: '', destination: '', purpose: '', nationality: '' })
  const [documents, setDocuments] = useState([])
  const [checklist, setChecklist] = useState([])
  const [newDocName, setNewDocName] = useState('')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [aiMessage, setAiMessage] = useState('')
  const [aiResponse, setAiResponse] = useState('')
  const [loading, setLoading] = useState(false)

  const API_URL = 'http://localhost:5051'

  const saveProfile = async () => {
    try {
      await axios.put(`${API_URL}/api/profile`, profile, {
        headers: { 'x-user-id': 'default-user-123' }
      })
      alert('✓ Profile saved!')
    } catch (error) {
      alert('Error: ' + error.message)
    }
  }

  const addDocument = async () => {
    if (!newDocName) {
      alert('Please enter a document name')
      return
    }
    try {
      const response = await axios.post(`${API_URL}/api/documents`, 
        { name: newDocName },
        { headers: { 'x-user-id': 'default-user-123' } }
      )
      setDocuments([...documents, response.data.data])
      setNewDocName('')
      alert('✓ Document added!')
    } catch (error) {
      alert('Error: ' + error.message)
    }
  }

  const deleteDocument = async (docId) => {
    try {
      await axios.delete(`${API_URL}/api/documents/${docId}`, {
        headers: { 'x-user-id': 'default-user-123' }
      })
      setDocuments(documents.filter(d => d.id !== docId))
      alert('✓ Document deleted!')
    } catch (error) {
      alert('Error: ' + error.message)
    }
  }

  const addTask = async () => {
    if (!newTaskTitle) {
      alert('Please enter a task')
      return
    }
    try {
      const response = await axios.post(`${API_URL}/api/checklist`,
        { title: newTaskTitle, category: 'documents', priority: 'medium' },
        { headers: { 'x-user-id': 'default-user-123' } }
      )
      setChecklist([...checklist, response.data.data])
      setNewTaskTitle('')
      alert('✓ Task added!')
    } catch (error) {
      alert('Error: ' + error.message)
    }
  }

  const toggleTask = async (taskId) => {
    try {
      const task = checklist.find(t => t.id === taskId)
      const response = await axios.patch(`${API_URL}/api/checklist/${taskId}/toggle`, {}, {
        headers: { 'x-user-id': 'default-user-123' }
      })
      setChecklist(checklist.map(t => t.id === taskId ? response.data.data : t))
    } catch (error) {
      alert('Error: ' + error.message)
    }
  }

  const deleteTask = async (taskId) => {
    try {
      await axios.delete(`${API_URL}/api/checklist/${taskId}`, {
        headers: { 'x-user-id': 'default-user-123' }
      })
      setChecklist(checklist.filter(t => t.id !== taskId))
      alert('✓ Task deleted!')
    } catch (error) {
      alert('Error: ' + error.message)
    }
  }

  const askAI = async () => {
    if (!aiMessage.trim()) {
      alert('Please type a message')
      return
    }
    try {
      setLoading(true)
      const response = await axios.post(`${API_URL}/api/assistant/message`,
        { message: aiMessage },
        { headers: { 'x-user-id': 'default-user-123' } }
      )
      setAiResponse(response.data.data.assistantResponse)
      setAiMessage('')
    } catch (error) {
      alert('Error: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const completedCount = checklist.filter(t => t.completed).length
  const completionPercent = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0

  return (
    <div className="app">
      <nav className="navbar">
        <h1>🌍 Globe Ready</h1>
        <div className="nav-buttons">
          <button 
            className={currentPage === 'dashboard' ? 'active' : ''}
            onClick={() => setCurrentPage('dashboard')}
          >
            📊 Dashboard
          </button>
          <button 
            className={currentPage === 'profile' ? 'active' : ''}
            onClick={() => setCurrentPage('profile')}
          >
            👤 Profile
          </button>
          <button 
            className={currentPage === 'documents' ? 'active' : ''}
            onClick={() => setCurrentPage('documents')}
          >
            📄 Documents
          </button>
          <button 
            className={currentPage === 'checklist' ? 'active' : ''}
            onClick={() => setCurrentPage('checklist')}
          >
            ✓ Checklist
          </button>
          <button 
            className={currentPage === 'assistant' ? 'active' : ''}
            onClick={() => setCurrentPage('assistant')}
          >
            🤖 Assistant
          </button>
        </div>
      </nav>

      <div className="container">
        {/* DASHBOARD PAGE */}
        {currentPage === 'dashboard' && (
          <div className="page">
            <h2>📊 Dashboard</h2>
            <div className="stats">
              <div className="stat-card">
                <h3>Documents</h3>
                <p className="stat-number">{documents.length}</p>
              </div>
              <div className="stat-card">
                <h3>Tasks</h3>
                <p className="stat-number">{checklist.length}</p>
              </div>
              <div className="stat-card">
                <h3>Completed</h3>
                <p className="stat-number">{completedCount}</p>
              </div>
              <div className="stat-card">
                <h3>Progress</h3>
                <p className="stat-number">{completionPercent}%</p>
              </div>
            </div>
            {profile.fullName && (
              <div className="welcome-box">
                <p>Welcome, <strong>{profile.fullName}</strong>!</p>
                {profile.destination && <p>Traveling to: <strong>{profile.destination}</strong></p>}
              </div>
            )}
          </div>
        )}

        {/* PROFILE PAGE */}
        {currentPage === 'profile' && (
          <div className="page">
            <h2>👤 My Profile</h2>
            <div className="form-group">
              <label>Full Name:</label>
              <input 
                value={profile.fullName}
                onChange={(e) => setProfile({...profile, fullName: e.target.value})}
                placeholder="Your full name"
              />
            </div>
            <div className="form-group">
              <label>Nationality:</label>
              <input 
                value={profile.nationality}
                onChange={(e) => setProfile({...profile, nationality: e.target.value})}
                placeholder="Your country"
              />
            </div>
            <div className="form-group">
              <label>Destination:</label>
              <input 
                value={profile.destination}
                onChange={(e) => setProfile({...profile, destination: e.target.value})}
                placeholder="Where are you traveling?"
              />
            </div>
            <div className="form-group">
              <label>Purpose:</label>
              <select 
                value={profile.purpose}
                onChange={(e) => setProfile({...profile, purpose: e.target.value})}
              >
                <option value="">Select...</option>
                <option value="study">Study</option>
                <option value="work">Work</option>
                <option value="visit">Visit</option>
              </select>
            </div>
            <button className="btn" onClick={saveProfile}>💾 Save Profile</button>
          </div>
        )}

        {/* DOCUMENTS PAGE */}
        {currentPage === 'documents' && (
          <div className="page">
            <h2>📄 Documents</h2>
            <div className="form-group">
              <input 
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
                placeholder="Document name (e.g., Passport)"
              />
              <button className="btn" onClick={addDocument}>➕ Add Document</button>
            </div>
            <div className="list">
              {documents.length === 0 ? (
                <p>No documents yet. Add one!</p>
              ) : (
                documents.map(doc => (
                  <div key={doc.id} className="list-item">
                    <div>
                      <strong>{doc.name}</strong>
                      <span className="status-badge">{doc.status}</span>
                    </div>
                    <button className="delete-btn" onClick={() => deleteDocument(doc.id)}>🗑️</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* CHECKLIST PAGE */}
        {currentPage === 'checklist' && (
          <div className="page">
            <h2>✓ Checklist</h2>
            <div className="progress-bar">
              <div className="progress" style={{width: completionPercent + '%'}}></div>
            </div>
            <p className="progress-text">{completedCount} of {checklist.length} completed ({completionPercent}%)</p>
            
            <div className="form-group">
              <input 
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Add a task..."
              />
              <button className="btn" onClick={addTask}>➕ Add Task</button>
            </div>
            <div className="list">
              {checklist.length === 0 ? (
                <p>No tasks yet. Add one!</p>
              ) : (
                checklist.map(task => (
                  <div key={task.id} className="list-item">
                    <input 
                      type="checkbox" 
                      checked={task.completed}
                      onChange={() => toggleTask(task.id)}
                    />
                    <div className="task-content">
                      <span style={{textDecoration: task.completed ? 'line-through' : 'none'}}>
                        {task.title}
                      </span>
                      <span className="priority-badge">{task.priority}</span>
                    </div>
                    <button className="delete-btn" onClick={() => deleteTask(task.id)}>🗑️</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ASSISTANT PAGE */}
        {currentPage === 'assistant' && (
          <div className="page">
            <h2>🤖 AI Assistant</h2>
            <div className="chat">
              <div className="chat-input">
                <input 
                  value={aiMessage}
                  onChange={(e) => setAiMessage(e.target.value)}
                  placeholder="Ask me about travel, documents, visas..."
                  onKeyPress={(e) => e.key === 'Enter' && askAI()}
                />
                <button className="btn" onClick={askAI} disabled={loading}>
                  {loading ? '⏳' : '📤'} Send
                </button>
              </div>
              {aiResponse && (
                <div className="chat-response">
                  <p><strong>🤖 AI:</strong> {aiResponse}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App