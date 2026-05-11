import React from "react";

export default function Footer() {
  return (
    <footer className="page-footer">
      <div className="footer-content">
        <p>LayoverPlus &copy; 2026</p>
        <div className="footer-links">
          <a
            href="https://github.com/calebponce/Capstone-Project-CSC-603"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <span className="api-status">
            <i className="dot ok"></i> API Active
          </span>
        </div>
      </div>
      <p className="footer-note">Launch prototype for layover intelligence workflows. Not production flight operations guidance.</p>
    </footer>
  );
}
