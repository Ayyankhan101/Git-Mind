import React from "react";
import LandingNav from "./landing/LandingNav";
import Hero from "./landing/Hero";
import Features from "./landing/Features";
import HowItWorks from "./landing/HowItWorks";
import LandingCTA from "./landing/LandingCTA";
import Footer from "./landing/Footer";
import "./LandingPage.css";

export default function LandingPage({ onLoad, onAnalyzeUrl }) {
  return (
    <div className="lp">
      <LandingNav />
      <Hero onLoad={onLoad} onAnalyzeUrl={onAnalyzeUrl} />
      <Features />
      <HowItWorks />
      <LandingCTA onLoad={onLoad} />
      <Footer />
    </div>
  );
}
