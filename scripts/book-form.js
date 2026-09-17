// The one implementation of the quote request form.
//
// Every page that carries the form, the home page included, gets it from here
// via the build. Hand-writing it into one page and generating it elsewhere is
// how the two copies drift, and you find out when a field added to one is
// missing from the other.
//
// The error text next to each field is the same string lib/validate.js returns,
// so a server side 400 shows the message that was already sitting in the
// markup rather than a second, differently worded one.

import { JOB_TYPES, PROPERTY_TYPES } from '../lib/validate.js';

const CHECKS = [
  ['New AC installation', 'New installation'],
  ['Servicing', 'Service or clean'],
  ['Repair / not cooling', 'Repair / not cooling'],
  ['Heating / heat pump', 'Heating / heat pump'],
  ['Ventilation / MVHR', 'Ventilation / MVHR'],
  ['Not sure', 'Not sure yet'],
];

const tick = '<span class="box" aria-hidden="true"></span>';

function checkboxes() {
  return CHECKS.map(([value, label]) => {
    // Guards against a label here drifting away from the list the server will
    // accept, which would show the visitor an option that always fails.
    if (!JOB_TYPES.includes(value)) throw new Error(`Unknown job type: ${value}`);
    return `<label class="check"><input type="checkbox" name="job_types" value="${value}" />${tick}${label}</label>`;
  }).join('\n            ');
}

function propertyOptions() {
  return PROPERTY_TYPES.map((t) => `<option>${t}</option>`).join('\n                ');
}

export function formHtml() {
  return `<div class="book-card" id="book">
      <div class="book-body">
        <div class="book-head">
          <h2>Get your fixed quote</h2>
          <p>Three short steps. We reply the same day with a price.</p>
        </div>
        <div class="dots" role="progressbar" aria-label="Form progress" aria-valuemin="1" aria-valuemax="3" aria-valuenow="1" id="dots">
          <span class="is-done"></span><span></span><span></span>
          <span class="step-label" id="step-label">Step 1 of 3</span>
        </div>

        <form id="book-form" novalidate>
          <!-- Filled means 200 and nothing written. Hidden from everybody who
               is not a bot, and never focusable by tab. -->
          <div class="trap" aria-hidden="true">
            <label for="f-website">Website</label>
            <input id="f-website" name="website" type="text" tabindex="-1" autocomplete="off" />
          </div>

          <div class="fstep is-active" data-step="1">
            <div class="form-row">
              <label for="f-name">First name</label>
              <input id="f-name" name="name" type="text" autocomplete="given-name" required />
              <span class="err" data-err="name">Please enter your first name.</span>
            </div>
            <div class="two-col">
              <div class="form-row">
                <label for="f-email">Email address</label>
                <input id="f-email" name="email" type="email" inputmode="email" autocomplete="email" required />
                <span class="err" data-err="email">Please enter a valid email address.</span>
              </div>
              <div class="form-row">
                <label for="f-postcode">Postcode</label>
                <input id="f-postcode" name="postcode" type="text" autocomplete="postal-code" required />
                <span class="err" data-err="postcode">Please enter your postcode.</span>
              </div>
            </div>
            <div class="fnav">
              <button type="button" class="btn btn--primary btn--lg" data-next>Start My Quote</button>
            </div>
          </div>

          <div class="fstep" data-step="2">
            <div class="form-row">
              <label id="issue-label">What do you need? Tick anything that applies.</label>
              <div class="checks" role="group" aria-labelledby="issue-label">
            ${checkboxes()}
              </div>
              <span class="err" data-err="job_types">Pick at least one, "Not sure yet" is fine.</span>
            </div>
            <div class="form-row">
              <label for="f-notes">Anything we should know? <span class="opt">(optional)</span></label>
              <textarea id="f-notes" name="notes" rows="3" placeholder="Rooms to cover, number of units, access, timescale"></textarea>
            </div>
            <div class="form-row" data-uploads hidden>
              <label for="f-files">Photos of the space <span class="opt">(optional)</span></label>
              <p class="hint">A photo of the room, the wall you want the unit on, or where the outdoor unit could go often turns a visit into a price over the phone, and always makes the visit shorter. A previous quote as a PDF is welcome too.</p>
              <input id="f-files" name="files" type="file" multiple accept="image/*,application/pdf" />
              <ul class="file-list" id="file-list"></ul>
            </div>
            <div class="fnav">
              <button type="button" class="back-link" data-back>Back</button>
              <button type="button" class="btn btn--primary btn--lg" data-next>Continue</button>
            </div>
          </div>

          <div class="fstep" data-step="3">
            <div class="form-row">
              <label for="f-property">What sort of property is it?</label>
              <select id="f-property" name="property_type" required>
                <option value="" disabled selected>Select one</option>
                ${propertyOptions()}
              </select>
              <span class="err" data-err="property_type">Please choose one.</span>
            </div>
            <div class="form-row">
              <label class="check" for="f-existing"><input type="checkbox" id="f-existing" name="existing_system" />${tick}There is existing air conditioning at the property</label>
            </div>
            <div class="form-row">
              <label for="f-address">Address of the property <span class="opt">(optional)</span></label>
              <input id="f-address" name="address_line" type="text" autocomplete="address-line1" />
            </div>
            <div class="two-col">
              <div class="form-row">
                <label for="f-town">Town <span class="opt">(optional)</span></label>
                <input id="f-town" name="town" type="text" autocomplete="address-level2" />
              </div>
              <div class="form-row">
                <!-- Asked again on purpose. The step one postcode is whatever
                     they typed to get started; this one is the property. -->
                <label for="f-property-postcode">Property postcode</label>
                <input id="f-property-postcode" name="property_postcode" type="text" autocomplete="postal-code" />
              </div>
            </div>
            <div class="form-row">
              <label for="f-phone">Phone number <span class="opt">(optional, quickest way to get you a price)</span></label>
              <input id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" />
            </div>
            <div class="fnav">
              <button type="button" class="back-link" data-back>Back</button>
              <button type="submit" class="btn btn--primary btn--lg">Request My Quote</button>
            </div>
          </div>
        </form>
        <p class="form-foot">Your details price your job and nothing else. No marketing lists, no third party referrals.</p>
      </div>

      <div class="book-success" role="status" hidden>
        <div class="check-ring" aria-hidden="true"></div>
        <h3>Received. We are on it.</h3>
        <p>An engineer will reply today. Where we need to see the space first, that visit is free, and your fixed written quote follows within 24 hours.</p>
        <p class="upload-note" id="upload-note" hidden></p>
      </div>
    </div>`;
}
