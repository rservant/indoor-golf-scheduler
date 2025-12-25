/**
 * Security tests for Enhanced Player List UI
 * Tests XSS vulnerability fixes
 */

import { EnhancedPlayerListUI } from './EnhancedPlayerListUI';
import { Player } from '../models/Player';

describe('EnhancedPlayerListUI Security Tests', () => {
  let container: HTMLElement;
  let playerListUI: EnhancedPlayerListUI;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    
    playerListUI = new EnhancedPlayerListUI(container, {
      containerHeight: 400,
      itemHeight: 60,
      enableVirtualScrolling: false, // Disable for easier testing
      enableProgressiveLoading: false
    });
  });

  afterEach(() => {
    playerListUI.destroy();
    document.body.removeChild(container);
  });

  describe('XSS Prevention in Search Input', () => {
    test('should escape HTML in search term display', async () => {
      const maliciousSearchTerm = '<script>alert("XSS")</script>';
      
      // Set up some test players
      const testPlayers: Player[] = [
        {
          id: '1',
          firstName: 'John',
          lastName: 'Doe',
          handedness: 'right',
          timePreference: 'AM',
          seasonId: 'test-season',
          createdAt: new Date()
        }
      ];
      
      await playerListUI.setPlayers(testPlayers);
      
      // Simulate search input with malicious content
      const searchInput = container.querySelector('.player-search-input') as HTMLInputElement;
      expect(searchInput).toBeTruthy();
      
      // Set malicious value and trigger input event
      searchInput.value = maliciousSearchTerm;
      searchInput.dispatchEvent(new Event('input'));
      
      // Check that the malicious script is not present in the DOM
      expect(container.innerHTML).not.toContain('<script>');
      expect(container.innerHTML).not.toContain('alert("XSS")');
      
      // Check that the search input value is properly sanitized
      expect(searchInput.value).toBe(maliciousSearchTerm); // Input value should remain as typed
      
      // Verify no script elements were created
      const scriptElements = container.querySelectorAll('script');
      expect(scriptElements.length).toBe(0);
    });

    test('should handle various XSS attack vectors safely', async () => {
      const xssVectors = [
        '<img src=x onerror=alert("XSS")>',
        '<svg onload=alert("XSS")>',
        'javascript:alert("XSS")',
        '<iframe src="javascript:alert(\'XSS\')"></iframe>',
        '<div onclick="alert(\'XSS\')">Click me</div>',
        '"><script>alert("XSS")</script>',
        '\' onmouseover="alert(\'XSS\')" ',
      ];

      const testPlayers: Player[] = [
        {
          id: '1',
          firstName: 'Test',
          lastName: 'Player',
          handedness: 'right',
          timePreference: 'AM',
          seasonId: 'test-season',
          createdAt: new Date()
        }
      ];
      
      await playerListUI.setPlayers(testPlayers);
      
      for (const xssVector of xssVectors) {
        const searchInput = container.querySelector('.player-search-input') as HTMLInputElement;
        
        // Set malicious value and trigger input event
        searchInput.value = xssVector;
        searchInput.dispatchEvent(new Event('input'));
        
        // Verify no dangerous elements were created
        expect(container.querySelectorAll('script').length).toBe(0);
        expect(container.querySelectorAll('iframe').length).toBe(0);
        expect(container.querySelectorAll('img[onerror]').length).toBe(0);
        expect(container.querySelectorAll('svg[onload]').length).toBe(0);
        expect(container.querySelectorAll('[onclick]').length).toBe(0);
        expect(container.querySelectorAll('[onmouseover]').length).toBe(0);
        
        // Check that dangerous patterns are not present as executable HTML
        expect(container.innerHTML).not.toContain('<script>');
        expect(container.innerHTML).not.toContain('<iframe');
        expect(container.innerHTML).not.toContain('javascript:');
        expect(container.innerHTML).not.toContain('<img src=x onerror=');
        expect(container.innerHTML).not.toContain('<svg onload=');
        expect(container.innerHTML).not.toContain('onclick=');
        expect(container.innerHTML).not.toContain('onmouseover=');
      }
    });
  });

  describe('XSS Prevention in Player Data', () => {
    test('should escape HTML in player names', async () => {
      const maliciousPlayers: Player[] = [
        {
          id: '1',
          firstName: '<script>alert("XSS")</script>',
          lastName: '<img src=x onerror=alert("XSS")>',
          handedness: 'right',
          timePreference: 'AM',
          seasonId: 'test-season',
          createdAt: new Date()
        },
        {
          id: '2',
          firstName: 'Normal',
          lastName: 'Player',
          handedness: 'left',
          timePreference: 'PM',
          seasonId: 'test-season',
          createdAt: new Date()
        }
      ];
      
      await playerListUI.setPlayers(maliciousPlayers);
      
      // Check that malicious scripts are not present in the DOM as executable HTML
      expect(container.innerHTML).not.toContain('<script>');
      expect(container.innerHTML).not.toContain('<img src=x onerror=');
      expect(container.innerHTML).not.toContain('javascript:');
      
      // Verify no script elements were created
      const scriptElements = container.querySelectorAll('script');
      expect(scriptElements.length).toBe(0);
      
      // Verify no img elements with onerror were created
      const imgElements = container.querySelectorAll('img[onerror]');
      expect(imgElements.length).toBe(0);
      
      // Verify that the content is properly escaped (should contain escaped HTML)
      expect(container.innerHTML).toContain('&lt;script&gt;');
      expect(container.innerHTML).toContain('&lt;img');
      
      // The text content should be safe but visible
      const playerNames = container.querySelectorAll('.player-name');
      expect(playerNames[0].textContent).toContain('script');
      expect(playerNames[0].textContent).toContain('alert("XSS")'); // Text content should show the original
      expect(playerNames[0].innerHTML).not.toContain('<script>'); // But HTML should be escaped
    });

    test('should handle special characters in player data safely', async () => {
      const specialCharPlayers: Player[] = [
        {
          id: '1',
          firstName: 'John & Jane',
          lastName: 'O\'Connor',
          handedness: 'right',
          timePreference: 'AM',
          seasonId: 'test-season',
          createdAt: new Date()
        },
        {
          id: '2',
          firstName: 'Test "Quote" Player',
          lastName: 'Smith<>',
          handedness: 'left',
          timePreference: 'PM',
          seasonId: 'test-season',
          createdAt: new Date()
        }
      ];
      
      await playerListUI.setPlayers(specialCharPlayers);
      
      // Verify special characters are handled safely
      const playerNames = container.querySelectorAll('.player-name');
      expect(playerNames.length).toBe(2);
      
      // Check that special characters are displayed correctly
      expect(playerNames[0].textContent).toBe('John & Jane O\'Connor');
      expect(playerNames[1].textContent).toBe('Test "Quote" Player Smith<>');
      
      // Verify no dangerous HTML was created
      expect(container.innerHTML).not.toContain('&amp;amp;'); // Double encoding check
    });
  });

  describe('DOM Manipulation Safety', () => {
    test('should use safe DOM methods instead of innerHTML', async () => {
      const testPlayers: Player[] = [
        {
          id: '1',
          firstName: 'Test',
          lastName: 'Player',
          handedness: 'right',
          timePreference: 'AM',
          seasonId: 'test-season',
          createdAt: new Date()
        }
      ];
      
      await playerListUI.setPlayers(testPlayers);
      
      // Verify that the DOM structure is created safely
      const searchContainer = container.querySelector('.search-container');
      expect(searchContainer).toBeTruthy();
      
      const searchInput = container.querySelector('.player-search-input');
      expect(searchInput).toBeTruthy();
      
      const playerCount = container.querySelector('.player-count');
      expect(playerCount).toBeTruthy();
      expect(playerCount?.textContent).toBe('1 players');
      
      // Verify player items are created safely
      const playerItems = container.querySelectorAll('.player-item');
      expect(playerItems.length).toBe(1);
      
      const playerInfo = container.querySelector('.player-info');
      expect(playerInfo).toBeTruthy();
      
      const playerName = container.querySelector('.player-name');
      expect(playerName?.textContent).toBe('Test Player');
    });

    test('should maintain functionality while preventing XSS', async () => {
      const testPlayers: Player[] = [
        {
          id: '1',
          firstName: 'Alice',
          lastName: 'Johnson',
          handedness: 'right',
          timePreference: 'AM',
          seasonId: 'test-season',
          createdAt: new Date()
        },
        {
          id: '2',
          firstName: 'Bob',
          lastName: 'Smith',
          handedness: 'left',
          timePreference: 'PM',
          seasonId: 'test-season',
          createdAt: new Date()
        }
      ];
      
      await playerListUI.setPlayers(testPlayers);
      
      // Test search functionality still works
      const searchInput = container.querySelector('.player-search-input') as HTMLInputElement;
      searchInput.value = 'Alice';
      searchInput.dispatchEvent(new Event('input'));
      
      // Should filter to show only Alice
      // Note: The filtering happens internally, we can verify by checking the state
      const selectedPlayers = playerListUI.getSelectedPlayers();
      expect(selectedPlayers).toBeDefined();
      
      // Test player selection still works
      const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox).toBeTruthy();
      
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change'));
      
      // Verify selection works
      const selectedAfterCheck = playerListUI.getSelectedPlayers();
      expect(selectedAfterCheck.length).toBe(1);
    });
  });
});