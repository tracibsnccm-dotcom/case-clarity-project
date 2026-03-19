/**
 * C.A.R.E. Clinical Sequencing Auditor — event binding (no inline handlers).
 * Inline script in index.html runs first and defines submitLead, startAudit, etc.
 */
document.addEventListener("DOMContentLoaded", () => {
  // Stub submitLead if not defined (e.g. parse error in main script)
  if (typeof window.submitLead !== "function") {
    window.submitLead = function () {
      const formInner = document.getElementById("lead-form-inner");
      const confirmInner = document.getElementById("lead-confirm-inner");
      if (formInner) formInner.style.display = "none";
      if (confirmInner) confirmInner.style.display = "block";
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  }

  // Begin the Clinical Sequencing Audit
  const beginBtn = document.getElementById("beginAuditBtn");
  if (beginBtn) {
    beginBtn.addEventListener("click", () => {
      if (typeof window.submitLead === "function") {
        window.submitLead();
      }
    });
  }

  // Before You Begin: checkbox enables "I Have Reviewed" button
  const bybCheckbox = document.getElementById("byb-checkbox");
  if (bybCheckbox && typeof window.toggleBeginBtn === "function") {
    bybCheckbox.addEventListener("change", window.toggleBeginBtn);
  }

  // I Have Reviewed the Protocol — Begin the Audit
  const startAuditBtn = document.getElementById("begin-audit-btn");
  if (startAuditBtn && typeof window.startAudit === "function") {
    startAuditBtn.addEventListener("click", window.startAudit);
  }

  // Floating reference panel
  const floatRefBtn = document.getElementById("float-ref-btn");
  if (floatRefBtn && typeof window.toggleRefPanel === "function") {
    floatRefBtn.addEventListener("click", window.toggleRefPanel);
    floatRefBtn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.toggleRefPanel();
      }
    });
  }
  const refPanelClose = document.querySelector(".ref-panel-close");
  if (refPanelClose && typeof window.toggleRefPanel === "function") {
    refPanelClose.addEventListener("click", window.toggleRefPanel);
  }

  // Generate Structural Alignment Summary
  const showResultsBtn = document.getElementById("show-results-btn");
  if (showResultsBtn && typeof window.showResults === "function") {
    showResultsBtn.addEventListener("click", window.showResults);
  }

  // Print / Save as PDF
  const btnPrint = document.getElementById("btn-print");
  if (btnPrint && typeof window.downloadReport === "function") {
    btnPrint.addEventListener("click", window.downloadReport);
  }

  // Email This Report
  const btnEmailReport = document.getElementById("btn-email-report");
  if (btnEmailReport && typeof window.emailReport === "function") {
    btnEmailReport.addEventListener("click", window.emailReport);
  }

  // Start New Assessment
  const btnReset = document.getElementById("btn-reset");
  if (btnReset && typeof window.resetTool === "function") {
    btnReset.addEventListener("click", window.resetTool);
  }

  // Unlock Full Report (Stripe)
  const btnUnlock = document.getElementById("btn-unlock");
  if (btnUnlock && typeof window.initiateStripeCheckout === "function") {
    btnUnlock.addEventListener("click", window.initiateStripeCheckout);
  }

  // Request a Clinical Sequencing Strategy Briefing
  const btnBriefing = document.getElementById("btn-briefing");
  if (btnBriefing && typeof window.showBriefingForm === "function") {
    btnBriefing.addEventListener("click", window.showBriefingForm);
  }

  // Learn About Reconcile C.A.R.E.
  const btnLearnMore = document.getElementById("btn-learn-more");
  if (btnLearnMore) {
    btnLearnMore.addEventListener("click", () => {
      window.open("https://reconcilecare.com", "_blank");
    });
  }

  // Briefing checkbox
  const briefingCheckbox = document.getElementById("briefing-checkbox");
  if (briefingCheckbox && typeof window.toggleBriefingCheckbox === "function") {
    briefingCheckbox.addEventListener("change", window.toggleBriefingCheckbox);
  }

  // Submit Briefing Request
  const briefingSubmitBtn = document.getElementById("briefing-submit-btn");
  if (briefingSubmitBtn && typeof window.submitBriefing === "function") {
    briefingSubmitBtn.addEventListener("click", window.submitBriefing);
  }

  // Briefing Cancel
  const briefingCancelBtn = document.getElementById("briefing-cancel-btn");
  if (briefingCancelBtn && typeof window.hideBriefingForm === "function") {
    briefingCancelBtn.addEventListener("click", window.hideBriefingForm);
  }

  // Briefing Dismiss (Return to Summary)
  const briefingDismissBtn = document.getElementById("briefing-dismiss-btn");
  if (briefingDismissBtn && typeof window.dismissBriefingConfirm === "function") {
    briefingDismissBtn.addEventListener("click", window.dismissBriefingConfirm);
  }
});
