import { Component, ChangeDetectionStrategy } from '@angular/core';

/**
 * Beispiel-Komponente für das Example-Frontend-Modul.
 * Wird dynamisch nachgeladen und in die Host-Anwendung integriert.
 */
@Component({
  selector: 'example-page',
  template: `
    <div class="example-page">
      <h1>Beispiel-Modul</h1>
      <p>Dies ist eine dynamisch nachgeladene Komponente des Beispiel-Moduls.</p>

      <div class="example-content">
        <h2>Features</h2>
        <ul>
          <li>Dynamisches Laden über Module-System</li>
          <li>Integration in bestehende Angular-Routing-Struktur</li>
          <li>Navigation-Erweiterung mit konfigurierbarer Position</li>
          <li>SemVer-Kompatibilitätsprüfung</li>
        </ul>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      padding: 20px;
    }

    .example-page {
      max-width: 800px;
      margin: 0 auto;
    }

    h1 {
      color: #333;
      border-bottom: 2px solid #007acc;
      padding-bottom: 10px;
    }

    h2 {
      color: #555;
      margin-top: 20px;
    }

    ul {
      list-style-type: disc;
      padding-left: 20px;
    }

    li {
      margin-bottom: 5px;
    }

  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamplePageComponent {
}
