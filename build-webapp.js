#!/usr/bin/env node

/**
 * Build script for creating a deployable web application
 * This creates a simple bundled version without complex build tools
 */

const fs = require('fs');
const path = require('path');

console.log('🏗️  Building Indoor Golf Scheduler Web Application...\n');

// Ensure directories exist
const publicDir = path.join(__dirname, 'public');
const distDir = path.join(__dirname, 'dist');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Copy CSS file to public directory
const srcCssPath = path.join(__dirname, 'src', 'ui', 'styles.css');
const publicCssPath = path.join(publicDir, 'styles.css');

if (fs.existsSync(srcCssPath)) {
  fs.copyFileSync(srcCssPath, publicCssPath);
  console.log('✅ Copied styles.css to public directory');
} else {
  console.log('⚠️  styles.css not found, creating basic styles');
  fs.writeFileSync(publicCssPath, '/* Basic styles for Indoor Golf Scheduler */\nbody { font-family: Arial, sans-serif; }');
}

// Create a simple JavaScript bundle
const bundlePath = path.join(publicDir, 'app.js');

const simpleAppBundle = `
/**
 * Simple Indoor Golf Scheduler Application
 * This is a basic implementation for demonstration purposes
 */

class SimpleGolfScheduler {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.seasons = JSON.parse(localStorage.getItem('golf_seasons') || '[]');
    this.players = JSON.parse(localStorage.getItem('golf_players') || '[]');
    this.activeSeason = localStorage.getItem('golf_active_season') || null;
    this.init();
  }
  
  init() {
    this.render();
    this.setupEventListeners();
    
    // Create demo data if none exists
    if (this.seasons.length === 0) {
      this.createDemoData();
    }
  }
  
  createDemoData() {
    const currentYear = new Date().getFullYear();
    const demoSeason = {
      id: 'demo-season-' + Date.now(),
      name: 'Demo Season ' + currentYear,
      startDate: new Date(currentYear, 2, 1).toISOString(),
      endDate: new Date(currentYear, 4, 31).toISOString(),
      isActive: true
    };
    
    this.seasons.push(demoSeason);
    this.activeSeason = demoSeason.id;
    
    const demoPlayers = [
      { id: 'p1', firstName: 'John', lastName: 'Smith', handedness: 'right', timePreference: 'AM', seasonId: demoSeason.id },
      { id: 'p2', firstName: 'Jane', lastName: 'Doe', handedness: 'left', timePreference: 'PM', seasonId: demoSeason.id },
      { id: 'p3', firstName: 'Bob', lastName: 'Johnson', handedness: 'right', timePreference: 'Either', seasonId: demoSeason.id },
      { id: 'p4', firstName: 'Alice', lastName: 'Williams', handedness: 'left', timePreference: 'Either', seasonId: demoSeason.id },
      { id: 'p5', firstName: 'Charlie', lastName: 'Brown', handedness: 'right', timePreference: 'AM', seasonId: demoSeason.id },
      { id: 'p6', firstName: 'Diana', lastName: 'Davis', handedness: 'left', timePreference: 'PM', seasonId: demoSeason.id }
    ];
    
    this.players = demoPlayers;
    this.saveData();
  }
  
  render() {
    const activeSeason = this.seasons.find(s => s.id === this.activeSeason);
    const seasonPlayers = this.players.filter(p => p.seasonId === this.activeSeason);
    
    this.container.innerHTML = \`
      <div class="app-loaded">
        <div class="app-header">
          <h2>🏌️ Golf Scheduler</h2>
          <div class="season-info">
            <strong>Active Season:</strong> \${activeSeason ? activeSeason.name : 'No season selected'}
          </div>
        </div>
        
        <div class="app-tabs">
          <button class="tab-btn active" data-tab="seasons">Seasons</button>
          <button class="tab-btn" data-tab="players">Players</button>
          <button class="tab-btn" data-tab="schedule">Schedule</button>
        </div>
        
        <div class="app-content">
          <div id="seasons-tab" class="tab-content active">
            <h3>Season Management</h3>
            <div class="form-group">
              <input type="text" id="season-name" placeholder="Season name (e.g., Spring 2024)">
              <button id="add-season">Add Season</button>
            </div>
            <div class="seasons-list">
              \${this.seasons.map(season => \`
                <div class="season-item \${season.id === this.activeSeason ? 'active' : ''}">
                  <span>\${season.name}</span>
                  <button onclick="app.setActiveSeason('\${season.id}')" \${season.id === this.activeSeason ? 'disabled' : ''}>
                    \${season.id === this.activeSeason ? 'Active' : 'Activate'}
                  </button>
                </div>
              \`).join('')}
            </div>
          </div>
          
          <div id="players-tab" class="tab-content">
            <h3>Player Management</h3>
            \${activeSeason ? \`
              <div class="form-group">
                <input type="text" id="player-first" placeholder="First name">
                <input type="text" id="player-last" placeholder="Last name">
                <select id="player-handedness">
                  <option value="right">Right-handed</option>
                  <option value="left">Left-handed</option>
                </select>
                <select id="player-preference">
                  <option value="AM">Morning (AM)</option>
                  <option value="PM">Afternoon (PM)</option>
                  <option value="Either">Either</option>
                </select>
                <button id="add-player">Add Player</button>
              </div>
              <div class="players-list">
                \${seasonPlayers.map(player => \`
                  <div class="player-item">
                    <span>\${player.firstName} \${player.lastName}</span>
                    <span class="player-details">\${player.handedness} | \${player.timePreference}</span>
                  </div>
                \`).join('')}
              </div>
            \` : '<p>Please select an active season first.</p>'}
          </div>
          
          <div id="schedule-tab" class="tab-content">
            <h3>Schedule Generation</h3>
            \${activeSeason && seasonPlayers.length >= 4 ? \`
              <button id="generate-schedule">Generate Weekly Schedule</button>
              <div id="schedule-display">
                <p>Click "Generate Weekly Schedule" to create an optimized schedule.</p>
              </div>
            \` : \`
              <p>You need at least 4 players in the active season to generate schedules.</p>
              <p>Current players: \${seasonPlayers.length}</p>
            \`}
          </div>
        </div>
      </div>
      
      <style>
        .app-loaded {
          background: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .app-header {
          background: #2e7d32;
          color: white;
          padding: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .app-header h2 {
          margin: 0;
        }
        
        .season-info {
          font-size: 0.9rem;
        }
        
        .app-tabs {
          display: flex;
          background: #f5f5f5;
          border-bottom: 1px solid #ddd;
        }
        
        .tab-btn {
          flex: 1;
          padding: 15px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 1rem;
          transition: background 0.2s;
        }
        
        .tab-btn:hover {
          background: #e0e0e0;
        }
        
        .tab-btn.active {
          background: white;
          border-bottom: 2px solid #2e7d32;
        }
        
        .app-content {
          padding: 20px;
        }
        
        .tab-content {
          display: none;
        }
        
        .tab-content.active {
          display: block;
        }
        
        .form-group {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        
        .form-group input, .form-group select, .form-group button {
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
        }
        
        .form-group button {
          background: #2e7d32;
          color: white;
          border: none;
          cursor: pointer;
        }
        
        .form-group button:hover {
          background: #1b5e20;
        }
        
        .season-item, .player-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px;
          border: 1px solid #ddd;
          border-radius: 8px;
          margin-bottom: 10px;
        }
        
        .season-item.active {
          background: #e8f5e8;
          border-color: #2e7d32;
        }
        
        .player-details {
          font-size: 0.9rem;
          color: #666;
        }
        
        .schedule-display {
          margin-top: 20px;
          padding: 20px;
          background: #f9f9f9;
          border-radius: 8px;
        }
        
        .time-slot {
          margin-bottom: 20px;
        }
        
        .time-slot h4 {
          color: #2e7d32;
          margin-bottom: 10px;
        }
        
        .foursome {
          background: white;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 10px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        
        .foursome-title {
          font-weight: bold;
          margin-bottom: 8px;
          color: #2e7d32;
        }
        
        .foursome-players {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 5px;
        }
        
        .player-name {
          padding: 5px;
          background: #f5f5f5;
          border-radius: 4px;
          font-size: 0.9rem;
        }
      </style>
    \`;
  }
  
  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        this.switchTab(tabName);
      });
    });
    
    // Add season
    const addSeasonBtn = document.getElementById('add-season');
    if (addSeasonBtn) {
      addSeasonBtn.addEventListener('click', () => this.addSeason());
    }
    
    // Add player
    const addPlayerBtn = document.getElementById('add-player');
    if (addPlayerBtn) {
      addPlayerBtn.addEventListener('click', () => this.addPlayer());
    }
    
    // Generate schedule
    const generateBtn = document.getElementById('generate-schedule');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => this.generateSchedule());
    }
  }
  
  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    document.querySelector(\`[data-tab="\${tabName}"]\`).classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(\`\${tabName}-tab\`).classList.add('active');
  }
  
  addSeason() {
    const nameInput = document.getElementById('season-name');
    const name = nameInput.value.trim();
    
    if (!name) {
      alert('Please enter a season name');
      return;
    }
    
    const newSeason = {
      id: 'season-' + Date.now(),
      name: name,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      isActive: false
    };
    
    this.seasons.push(newSeason);
    nameInput.value = '';
    this.saveData();
    this.render();
  }
  
  setActiveSeason(seasonId) {
    this.activeSeason = seasonId;
    this.saveData();
    this.render();
  }
  
  addPlayer() {
    const firstName = document.getElementById('player-first').value.trim();
    const lastName = document.getElementById('player-last').value.trim();
    const handedness = document.getElementById('player-handedness').value;
    const timePreference = document.getElementById('player-preference').value;
    
    if (!firstName || !lastName) {
      alert('Please enter both first and last name');
      return;
    }
    
    const newPlayer = {
      id: 'player-' + Date.now(),
      firstName,
      lastName,
      handedness,
      timePreference,
      seasonId: this.activeSeason
    };
    
    this.players.push(newPlayer);
    
    // Clear form
    document.getElementById('player-first').value = '';
    document.getElementById('player-last').value = '';
    
    this.saveData();
    this.render();
  }
  
  generateSchedule() {
    const seasonPlayers = this.players.filter(p => p.seasonId === this.activeSeason);
    
    // Simple scheduling algorithm
    const amPlayers = seasonPlayers.filter(p => p.timePreference === 'AM');
    const pmPlayers = seasonPlayers.filter(p => p.timePreference === 'PM');
    const eitherPlayers = seasonPlayers.filter(p => p.timePreference === 'Either');
    
    // Distribute "Either" players to balance slots
    const amTotal = amPlayers.length + Math.floor(eitherPlayers.length / 2);
    const pmTotal = pmPlayers.length + Math.ceil(eitherPlayers.length / 2);
    
    const amSlot = [...amPlayers, ...eitherPlayers.slice(0, Math.floor(eitherPlayers.length / 2))];
    const pmSlot = [...pmPlayers, ...eitherPlayers.slice(Math.floor(eitherPlayers.length / 2))];
    
    const schedule = {
      morning: this.createFoursomes(amSlot),
      afternoon: this.createFoursomes(pmSlot)
    };
    
    this.displaySchedule(schedule);
  }
  
  createFoursomes(players) {
    const foursomes = [];
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < shuffled.length; i += 4) {
      const group = shuffled.slice(i, i + 4);
      foursomes.push(group);
    }
    
    return foursomes;
  }
  
  displaySchedule(schedule) {
    const display = document.getElementById('schedule-display');
    
    display.innerHTML = \`
      <div class="time-slot">
        <h4>🌅 Morning Session (10:30 AM)</h4>
        \${schedule.morning.map((foursome, index) => \`
          <div class="foursome">
            <div class="foursome-title">Group \${index + 1}</div>
            <div class="foursome-players">
              \${foursome.map(player => \`
                <div class="player-name">\${player.firstName} \${player.lastName} (\${player.handedness})</div>
              \`).join('')}
            </div>
          </div>
        \`).join('')}
      </div>
      
      <div class="time-slot">
        <h4>🌇 Afternoon Session (1:00 PM)</h4>
        \${schedule.afternoon.map((foursome, index) => \`
          <div class="foursome">
            <div class="foursome-title">Group \${index + 1}</div>
            <div class="foursome-players">
              \${foursome.map(player => \`
                <div class="player-name">\${player.firstName} \${player.lastName} (\${player.handedness})</div>
              \`).join('')}
            </div>
          </div>
        \`).join('')}
      </div>
    \`;
  }
  
  saveData() {
    localStorage.setItem('golf_seasons', JSON.stringify(this.seasons));
    localStorage.setItem('golf_players', JSON.stringify(this.players));
    localStorage.setItem('golf_active_season', this.activeSeason);
  }
}

// Initialize the application
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new SimpleGolfScheduler('golf-scheduler-app');
  console.log('🏌️ Indoor Golf Scheduler loaded successfully!');
});
`;

fs.writeFileSync(bundlePath, simpleAppBundle);
console.log('✅ Created app.js bundle');

// Update the HTML to include the JavaScript
const htmlPath = path.join(publicDir, 'index.html');
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Add the script tag before closing body
htmlContent = htmlContent.replace(
  '</body>',
  '    <script src="app.js"></script>\n</body>'
);

fs.writeFileSync(htmlPath, htmlContent);
console.log('✅ Updated index.html to include app.js');

console.log('\n🎉 Web application built successfully!');
console.log('\n📋 Next steps:');
console.log('   1. Run: npm run serve');
console.log('   2. Open: http://localhost:3000');
console.log('   3. Start using the Golf Scheduler!');
console.log('\n💡 The application includes:');
console.log('   - Season management');
console.log('   - Player management');
console.log('   - Basic schedule generation');
console.log('   - Local storage persistence');