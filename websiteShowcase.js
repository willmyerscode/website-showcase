/**
 * Website Showcase Plugin for Squarespace
 * Transforms list sections into interactive website previews with iframe popups
 * Copyright Will-Myers.com
 **/

class WMWebsiteShowcase {
  static pluginName = 'website-showcase';

  static emitEvent(type, detail = {}, elem = document) {
    elem.dispatchEvent(new CustomEvent(`wm-${this.pluginName}${type}`, { detail, bubbles: true }));
  }

  constructor(el, settings = {}) {
    this.el = el;
    this.settings = {
      layout: 'basic', // 'basic' or 'info'
      infoPosition: 'right', // 'left' or 'right'
      infoPositionMobile: 'below', // 'above' or 'below'
      ...settings
    };
    this.data = null;
    this.sectionTitle = null;
    this.sectionButton = null;
    this.options = null;
    this.styles = null;
    this.originalContainer = null;
    this.pluginName = this.constructor.pluginName;
    this.isBackend = window.top !== window.self;
    this.popup = null;
    this.boundHandleOutsideClick = this.handleOutsideClick.bind(this);
    this.boundHandleKeydown = this.handleKeydown.bind(this);
    this.init();
  }

  init() {
    WMWebsiteShowcase.emitEvent(':beforeInit', { el: this.el }, this.el);
    this.addDataAttribute();
    this.extractData();
    this.buildOverlays();
    this.bindEvents();
    WMWebsiteShowcase.emitEvent(':afterInit', { el: this.el }, this.el);
  }

  addDataAttribute() {
    this.el.setAttribute('data-wm-plugin', this.pluginName);
    this.el.setAttribute('data-wm-layout', this.settings.layout || 'basic');
  }

  extractData() {
    const container = this.el.querySelector('.user-items-list-item-container');
    if (!container || !container.dataset.currentContext) {
      console.error(`[${this.pluginName}] No data-current-context found`);
      return;
    }

    const contextData = JSON.parse(container.dataset.currentContext);
    this.originalContainer = container;
    this.data = contextData.userItems || [];
    this.options = contextData.options || {};
    this.styles = contextData.styles || {};
    this.sectionTitle = contextData.sectionTitle || null;
    this.sectionButton = contextData.sectionButton || null;
  }

  buildOverlays() {
    if (!this.data || this.data.length === 0) return;

    // Find all list items (works for both Grid and Carousel)
    const listItems = this.el.querySelectorAll('.list-item, .user-items-list-simple__item, .preFade');
    
    listItems.forEach((item, index) => {
      const itemData = this.data[index % this.data.length]; // Use modulo for cloned items
      if (!itemData) return;

      // Get the button link and item info for the iframe
      const buttonLink = itemData.button?.buttonLink || '#';
      const buttonText = itemData.button?.buttonText || 'View Site';
      const itemTitle = itemData.title || 'Website Preview';
      const itemDescription = itemData.description || '';
      
      // Find the media inner element (the one directly wrapping the image)
      // This is more reliable than the outer container which may have overflow issues
      const mediaInner = item.querySelector(
        '.user-items-list-carousel__media-inner, ' +
        '.user-items-list__media-inner, ' +
        '.list-item-media-inner, ' +
        '.user-items-list-simple__media-inner, ' +
        '[data-animation-role="image"]'
      );

      // Fallback to media container if inner not found
      const mediaContainer = mediaInner || item.querySelector(
        '.user-items-list-carousel__media-container, ' +
        '.user-items-list__media-container, ' +
        '.list-item-media-container, ' +
        '.user-items-list-simple__media-container'
      );

      if (!mediaContainer) return;

      // Skip if overlay already exists (for cloned items)
      if (mediaContainer.querySelector('.wm-showcase-overlay')) return;

      // Add class for CSS targeting
      mediaContainer.classList.add('wm-showcase-media');

      // Create overlay with data attributes for event delegation
      const overlay = document.createElement('div');
      overlay.className = 'wm-showcase-overlay';
      overlay.innerHTML = `<span class="wm-showcase-overlay-text">${this.escapeHtml(buttonText)}</span>`;
      overlay.dataset.buttonLink = buttonLink;
      overlay.dataset.buttonText = buttonText;
      overlay.dataset.itemTitle = itemTitle;
      overlay.dataset.itemDescription = itemDescription;

      mediaContainer.appendChild(overlay);
    });
  }

  openPopup(url, title, description = '', buttonText = 'View Site') {
    // Close existing popup if any
    this.closePopup();

    // Ensure URL is absolute
    const absoluteUrl = this.makeAbsoluteUrl(url);

    // Get font sizes from list section options
    const customOptions = this.options?.customOptions || {};
    const titleFontSize = customOptions.customTitleFontSize 
      ? `${customOptions.customTitleFontSize.value}${customOptions.customTitleFontSize.unit || 'rem'}`
      : null;
    const bodyFontSize = customOptions.customBodyFontSize
      ? `${customOptions.customBodyFontSize.value}${customOptions.customBodyFontSize.unit || 'rem'}`
      : null;
    
    // Determine layout
    const layout = this.settings.layout || 'basic';
    const infoPosition = this.settings.infoPosition || 'right';
    const infoPositionMobile = this.settings.infoPositionMobile || 'below';
    const layoutClass = layout === 'info' ? `wm-showcase-popup--info wm-showcase-popup--info-${infoPosition} wm-showcase-popup--info-mobile-${infoPositionMobile}` : '';

    // Build buttons HTML
    const buttonsHtml = `
      <a class="wm-showcase-popup-external" href="${this.escapeHtml(absoluteUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open in new tab">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>
      <button class="wm-showcase-popup-close" aria-label="Close popup">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    `;

    // Build info panel HTML if using info layout
    const infoPanel = layout === 'info' ? `
      <div class="wm-showcase-popup-info">
        <div class="wm-showcase-popup-info-buttons">
          ${buttonsHtml}
        </div>
        <h2 class="wm-showcase-popup-info-title">${this.escapeHtml(title)}</h2>
        ${description ? `<div class="wm-showcase-popup-info-description">${description}</div>` : ''}
        <a class="wm-showcase-popup-info-button sqs-button-element--primary" href="${this.escapeHtml(absoluteUrl)}" target="_blank" rel="noopener noreferrer">
          ${this.escapeHtml(buttonText)}
        </a>
      </div>
    ` : '';

    // Build header (always include, hidden on desktop for info layout via CSS)
    const headerHtml = `
      <div class="wm-showcase-popup-header">
        ${buttonsHtml}
      </div>
    `;

    // Get section theme for color inheritance
    const sectionTheme = this.el.dataset.sectionTheme;

    // Create popup elements
    this.popup = document.createElement('div');
    this.popup.className = `wm-showcase-popup ${layoutClass}`;
    this.popup.setAttribute('data-wm-plugin', this.pluginName);
    if (sectionTheme) {
      this.popup.setAttribute('data-section-theme', sectionTheme);
    }
    this.popup.innerHTML = `
      <div class="wm-showcase-popup-backdrop"></div>
      <div class="wm-showcase-popup-container">
        ${headerHtml}
        <div class="wm-showcase-popup-body">
          <div class="wm-showcase-popup-main">
            <div class="wm-showcase-popup-loader">
              <div class="wm-showcase-spinner"></div>
            </div>
            <div class="wm-showcase-popup-error">
              Unable to load website, disable Clickjack Protection in the Squarespace Settings of the embedded site.
            </div>
            <iframe 
              class="wm-showcase-iframe" 
              src="${this.escapeHtml(absoluteUrl)}" 
              title="Website Preview"
              loading="eager"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowfullscreen
              referrerpolicy="no-referrer-when-downgrade"
            ></iframe>
          </div>
          ${infoPanel}
        </div>
      </div>
    `;

    const siteWrapper = document.querySelector('#siteWrapper') || document.body;
    siteWrapper.appendChild(this.popup);
    document.body.style.overflow = 'hidden';

    // Apply list section font sizes to popup
    if (titleFontSize) {
      this.popup.style.setProperty('--popup-info-title-size', titleFontSize);
    }
    if (bodyFontSize) {
      this.popup.style.setProperty('--popup-info-description-size', bodyFontSize);
    }

    // Bind close handlers to ALL close buttons (header and info panel)
    const closeBtns = this.popup.querySelectorAll('.wm-showcase-popup-close');
    const backdrop = this.popup.querySelector('.wm-showcase-popup-backdrop');
    const iframe = this.popup.querySelector('.wm-showcase-iframe');

    closeBtns.forEach(btn => btn.addEventListener('click', () => this.closePopup()));
    backdrop.addEventListener('click', () => this.closePopup());
    document.addEventListener('keydown', this.boundHandleKeydown);

    // Track load timing - error pages load almost instantly
    const loadStartTime = Date.now();
    
    // Hide loader when iframe loads successfully
    iframe.addEventListener('load', () => {
      const loader = this.popup?.querySelector('.wm-showcase-popup-loader');
      const errorEl = this.popup?.querySelector('.wm-showcase-popup-error');
      if (!loader) return;
      
      const loadTime = Date.now() - loadStartTime;
      
      // If page loaded in under 200ms, it's likely a browser error page (blocked by X-Frame-Options)
      // Real websites take longer to load
      if (loadTime < 200) {
        loader.style.display = 'none';
        if (errorEl) errorEl.style.zIndex = '2';
      } else {
        loader.style.display = 'none';
      }
    });

    // Handle iframe error
    iframe.addEventListener('error', () => {
      const loader = this.popup?.querySelector('.wm-showcase-popup-loader');
      const errorEl = this.popup?.querySelector('.wm-showcase-popup-error');
      if (loader) loader.style.display = 'none';
      if (errorEl) errorEl.style.zIndex = '2';
    });

    // Trigger animation
    requestAnimationFrame(() => {
      this.popup.classList.add('wm-showcase-popup--visible');
    });

    WMWebsiteShowcase.emitEvent(':popupOpen', { url, title, el: this.el }, this.el);
  }

  closePopup() {
    if (!this.popup) return;

    this.popup.classList.remove('wm-showcase-popup--visible');
    document.removeEventListener('keydown', this.boundHandleKeydown);

    // Wait for animation before removing
    setTimeout(() => {
      if (this.popup && this.popup.parentNode) {
        this.popup.parentNode.removeChild(this.popup);
      }
      this.popup = null;
      document.body.style.overflow = '';
    }, 300);

    WMWebsiteShowcase.emitEvent(':popupClose', { el: this.el }, this.el);
  }

  handleOutsideClick(e) {
    if (this.popup && !this.popup.querySelector('.wm-showcase-popup-container').contains(e.target)) {
      this.closePopup();
    }
  }

  handleKeydown(e) {
    if (e.key === 'Escape') {
      this.closePopup();
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  makeAbsoluteUrl(url) {
    // If already absolute, return as-is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    // Convert relative URL to absolute
    try {
      return new URL(url, window.location.origin).href;
    } catch (e) {
      return url;
    }
  }

  bindEvents() {
    // Use event delegation for overlay clicks (handles cloned items in infinite scroll)
    this.boundHandleOverlayClick = this.handleOverlayClick.bind(this);
    this.el.addEventListener('click', this.boundHandleOverlayClick);
  }

  handleOverlayClick(e) {
    const overlay = e.target.closest('.wm-showcase-overlay');
    if (!overlay) return;

    e.preventDefault();
    e.stopPropagation();

    const buttonLink = overlay.dataset.buttonLink || '#';
    const buttonText = overlay.dataset.buttonText || 'View Site';
    const itemTitle = overlay.dataset.itemTitle || 'Website Preview';
    const itemDescription = overlay.dataset.itemDescription || '';
    
    this.openPopup(buttonLink, itemTitle, itemDescription, buttonText);
  }

  destroy() {
    // Close any open popup
    this.closePopup();

    // Remove event delegation listener
    if (this.boundHandleOverlayClick) {
      this.el.removeEventListener('click', this.boundHandleOverlayClick);
    }

    // Remove overlays
    const overlays = this.el.querySelectorAll('.wm-showcase-overlay');
    overlays.forEach(overlay => overlay.remove());

    // Remove added classes
    const mediaElements = this.el.querySelectorAll('.wm-showcase-media');
    mediaElements.forEach(el => el.classList.remove('wm-showcase-media'));

    // Remove data attributes
    this.el.removeAttribute('data-wm-plugin');
    this.el.removeAttribute('data-wm-layout');

    WMWebsiteShowcase.emitEvent(':destroy', { el: this.el }, this.el);
  }
}

// Immediate initialization
(function() {
  const pluginName = 'website-showcase';
  const sections = document.querySelectorAll(`[id^="${pluginName}"]`);
  const instances = [];

  sections.forEach(section => {
    const sectionId = section.id;
    const settings = window.wmWebsiteShowcaseSettings?.[sectionId] || {};
    const instance = new WMWebsiteShowcase(section, settings);
    instances.push(instance);
  });

  // Backend teardown when edit mode activates
  if (window.top !== window.self) {
    const observer = new MutationObserver(() => {
      if (document.body.classList.contains('sqs-edit-mode-active')) {
        instances.forEach(instance => {
          if (instance && typeof instance.destroy === 'function') {
            instance.destroy();
          }
        });
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
})();



