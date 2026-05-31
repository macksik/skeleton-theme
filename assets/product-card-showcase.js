/**
 * Product card showcase — custom element (light DOM, no Shadow Root).
 * Section Rendering API + Combined Listings (option_values).
 */
class ProductCardShowcase extends HTMLElement {
  static SWATCH_SELECTOR = '[data-variant-swatch]';

  #abortController = null;
  #boundClick = null;

  connectedCallback() {
    this.#abortController = new AbortController();
    this.#boundClick = this.#handleClick.bind(this);
    this.addEventListener('click', this.#boundClick, {
      signal: this.#abortController.signal,
    });
  }

  disconnectedCallback() {
    this.#abortController?.abort();
    this.#abortController = null;
    this.#boundClick = null;
  }

  get sectionId() {
    return this.dataset.sectionId || '';
  }

  get productHandle() {
    return this.dataset.productHandle || '';
  }

  #handleClick(event) {
    const swatch = event.target.closest(ProductCardShowcase.SWATCH_SELECTOR);
    if (!swatch || swatch.disabled || !this.contains(swatch)) return;

    event.preventDefault();
    this.#selectOptionValue(swatch);
  }

  #getPageFetchUrl() {
    const url = new URL(window.location.href);
    url.hash = '';
    return url;
  }

  #buildFetchUrl(swatch, mode) {
    const url = this.#getPageFetchUrl();
    const optionValueId = swatch.dataset.optionValueId;

    url.searchParams.delete('variant');
    url.searchParams.set('option_values', optionValueId);
    url.searchParams.set('sections_url', window.location.pathname);

    if (this.productHandle) {
      url.searchParams.set('product_handle', this.productHandle);
    }

    if (mode === 'section_id') {
      url.searchParams.set('section_id', this.sectionId);
      url.searchParams.delete('sections');
    } else {
      url.searchParams.set('sections', this.sectionId);
      url.searchParams.delete('section_id');
    }

    return url.toString();
  }

  #resolveSectionHtml(payload) {
    if (!payload || typeof payload !== 'object') return null;

    const sectionId = this.sectionId;
    if (payload[sectionId]) return payload[sectionId];

    const match = Object.keys(payload).find(
      (key) => key === sectionId || decodeURIComponent(key) === sectionId
    );
    if (match) return payload[match];

    const keys = Object.keys(payload);
    return keys.length === 1 ? payload[keys[0]] : null;
  }

  async #fetchSectionHtml(swatch) {
    const jsonResponse = await fetch(this.#buildFetchUrl(swatch, 'sections'), {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });

    if (jsonResponse.ok) {
      const contentType = jsonResponse.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await jsonResponse.json();
        const html = this.#resolveSectionHtml(payload);
        if (html) return html;
      }
    }

    const textResponse = await fetch(this.#buildFetchUrl(swatch, 'section_id'), {
      credentials: 'same-origin',
    });

    if (!textResponse.ok) {
      throw new Error(`Section request failed (${textResponse.status})`);
    }

    return textResponse.text();
  }

  #findElementInSectionHtml(doc) {
    const sectionId = this.sectionId;

    return (
      doc.querySelector(`product-card-showcase[data-section-id="${sectionId}"]`) ||
      doc.querySelector('product-card-showcase') ||
      doc.querySelector('[data-product-card-root]') ||
      doc.querySelector('.product-card-showcase__card-wrap')
    );
  }

  #hydrateFromSectionHtml(sectionHtml) {
    const doc = new DOMParser().parseFromString(sectionHtml, 'text/html');
    const freshElement = this.#findElementInSectionHtml(doc);

    if (!freshElement) {
      throw new Error(`product-card-showcase missing in section response (${this.sectionId})`);
    }

    if (freshElement.querySelector('.product-card__empty')) {
      throw new Error('Product not resolved. Check product_handle in URL.');
    }

    this.innerHTML = freshElement.innerHTML;
    this.#syncDataset(freshElement);
  }

  #syncDataset(source) {
    if (source.dataset.sectionId) {
      this.dataset.sectionId = source.dataset.sectionId;
    }
    if (source.dataset.productHandle) {
      this.dataset.productHandle = source.dataset.productHandle;
    }
    if (source.dataset.productUrl) {
      this.dataset.productUrl = source.dataset.productUrl;
    }
  }

  #setLoading(isLoading) {
    this.classList.toggle('is-loading', isLoading);
    this.querySelectorAll(ProductCardShowcase.SWATCH_SELECTOR).forEach((btn) => {
      if (isLoading && !btn.disabled) {
        btn.disabled = true;
        return;
      }
      if (!isLoading) {
        btn.disabled = btn.classList.contains('is-unavailable');
      }
    });
  }

  async #selectOptionValue(swatch) {
    if (swatch.getAttribute('aria-pressed') === 'true') return;

    const optionValueId = swatch.dataset.optionValueId;
    if (!optionValueId || !this.sectionId) return;

    this.#setLoading(true);

    try {
      const sectionHtml = await this.#fetchSectionHtml(swatch);
      this.#hydrateFromSectionHtml(sectionHtml);
    } catch (error) {
      console.error('[product-card-showcase]', error);
    } finally {
      this.#setLoading(false);
    }
  }
}

if (!customElements.get('product-card-showcase')) {
  customElements.define('product-card-showcase', ProductCardShowcase);
}
