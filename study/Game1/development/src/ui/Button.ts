/**
 * Button Component for UI interactions
 */
export class ButtonComponent {
  private element: HTMLElement;

  /**
   * Creates a new button component
   * @param elementId - The ID of the existing button element
   */
  constructor(elementId: string) {
    const element = document.getElementById(elementId);
    
    if (!element) {
      throw new Error(`Button element with ID "${elementId}" not found`);
    }
    
    this.element = element;
  }

  /**
   * Registers a click event handler
   * @param handler - The function to call when button is clicked
   */
  public onClick(handler: () => void): void {
    this.element.addEventListener('click', () => {
      // Use requestAnimationFrame for better performance
      requestAnimationFrame(() => {
        handler();
      });
    });
  }

  /**
   * Sets the button text
   * @param text - The text to display on the button
   */
  public setText(text: string): void {
    this.element.textContent = text;
  }

  /**
   * Enables or disables the button
   * @param isEnabled - Whether the button should be enabled
   */
  public setEnabled(isEnabled: boolean): void {
    if (isEnabled) {
      this.element.removeAttribute('disabled');
      this.element.classList.remove('disabled');
    } else {
      this.element.setAttribute('disabled', 'true');
      this.element.classList.add('disabled');
    }
  }

  /**
   * Gets the HTML element for this button
   */
  public getElement(): HTMLElement {
    return this.element;
  }
} 