# BB84 Quantum Key Distribution & PTRP Stochastic Simulation Lab

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML5 Canvas](https://img.shields.io/badge/HTML5-Canvas%20&%20WebAudio-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![Firebase](https://img.shields.io/badge/Firebase-Realtime%20DB-orange.svg)](https://firebase.google.com/)

An interactive, visual simulation and mathematical validation laboratory for the **Bennett-Brassard 1984 (BB84) Quantum Key Distribution protocol**, modeled through the lens of **Probability Theory and Random Processes (PTRP)**.

---

## 🌟 Key Features

1. **Interactive Quantum Optical Bench (`#channel-canvas`)**:
   - Real-time animated traveling photon wavepackets with transverse electromagnetic wave oscillations ($E(x) = A \sin(kx - \omega t)$) and visible polarization angle arrows ($0^\circ, 90^\circ, 45^\circ, 135^\circ$).
   - Alice’s diode laser state preparation with active basis toggle ($+$ Rectilinear or $\times$ Diagonal).
   - Eve’s intercept-resend attack with wavefunction collapse animations.
   - Bob’s Polarizing Beam Splitter (PBS) and dual Avalanche Photodiode (APD) detectors ($D_0$ and $D_1$) with realistic Geiger-style acoustic clicks via the Web Audio API.

2. **Key Distillation Pipeline Visualizer (Stages 01–06)**:
   - Dynamic 6-stage protocol flow tracking raw bit preparation $\to$ transmission $\to$ measurement $\to$ basis sifting $\to$ QBER test $\to$ privacy amplification.
   - Interactive color-coded bitstream transformation ribbons.

3. **PTRP Probability & Stochastic Analytics Suite**:
   - **Central Limit Theorem (CLT) Validation**: Sifted key length $K \sim \text{Binomial}(N, 1/2)$ compared against the theoretical Gaussian distribution $\mathcal{N}(N/2, N/4)$ with empirical higher-order moments (mean, variance, skewness $\approx 0$, kurtosis $\approx 3$, and $Z$-score).
   - **Martingale Random Walk**: Centered cumulative sum $S_n = \sum_{i=1}^n (X_i - 0.5)$ plotted against $\pm 2\sigma$ and $\pm 3\sigma$ Brownian diffusion bounds.
   - **Strong Law of Large Numbers (SLLN)**: Running sample mean $\bar{X}_n \xrightarrow{a.s.} 0.5$ convergence path with Chebychev confidence envelope $\pm 3 / \sqrt{n}$.
   - **Conditional Error Probability & Bayes' Theorem**: Law of Total Probability tree diagram deriving $P(\text{Bob Error} \mid \text{Match}, \text{Eve}) = 25\%$.
   - **Information Theory**: Shannon binary entropy curve $H_2(p)$ and asymptotic secret key rate $R = \max(0, 1 - 2H_2(Q))$, demonstrating the fundamental $11.0\%$ Shor-Preskill security bound.
   - **Hypothesis Testing**: Formal one-sided $Z$-test on QBER ($H_0: Q \le 0.11$ vs. $H_1: Q > 0.11$).

4. **Vernam One-Time Pad (OTP) Encrypted Chat**:
   - True multi-bit stream cipher consuming quantum key bits character-by-character ($C_i = P_i \oplus K_i$).
   - Live visual Key Reservoir tracking available quantum entropy.
   - "Inspect Math 🔍" modal breaking down bitwise XOR operations and proving Shannon's Perfect Secrecy ($H(M \mid C) = H(M)$).

5. **Multi-Station Realtime Synchronization**:
   - Synchronized communication over Firebase Realtime Database across separate browser tabs/devices for Alice and Bob.
   - Resilient offline fallback for standalone local demonstrations.

---

## 📁 Repository Structure

```
├── index.html                   # Cyber-quantum entrance portal & role router
├── chat.html                    # Main Quantum Lab interface & optical bench
├── script.js                    # BB84 stochastic engine, canvas renderer, WebAudio & Firebase
├── style.css                    # Responsive cyberpunk-quantum glassmorphism stylesheet
├── standalone_demo.html         # Single-file bundled demo (embedded CSS/JS for zero dependencies)
├── PROJECT_REPORT_AND_VIVA_GUIDE.md # Comprehensive mathematical proofs, derivations & viva questions
└── README.md                    # Project documentation
```

---

## 🚀 Getting Started

### Option 1: Direct Browser Launch
Simply double-click `index.html` (or `standalone_demo.html`) in your file explorer to open it in any modern web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, or Safari).

### Option 2: Local HTTP Server (Recommended for multi-client testing)
To simulate two separate communicating stations (Alice in one window, Bob in another):
```bash
# Clone the repository
git clone https://github.com/Warfare06/bb84-ptrp-quantum-lab.git
cd bb84-ptrp-quantum-lab

# Start a local web server
python3 -m http.server 8000
```
Open `http://localhost:8000` in two different browser tabs:
* In Tab 1: Log in as **Alice** on `Server 1 · Alpha Channel`.
* In Tab 2: Log in as **Bob** on `Server 1 · Alpha Channel`.

---

## 📐 Mathematical Model Summary

| Concept | Formulation | Physical Meaning in BB84 |
| :--- | :--- | :--- |
| **Basis Match** | $P(B_A = B_B) = 1/2$ | Sifting probability: $\approx 50\%$ of raw qubits are retained |
| **Sifted Key Length** | $K \sim \text{Binomial}(N, 1/2)$ | Discrete random variable of matching bases |
| **Moments** | $\mathbb{E}[K] = \frac{N}{2}, \; \text{Var}(K) = \frac{N}{4}$ | First and second order statistical moments |
| **Central Limit Theorem** | $Z_N = \frac{K - N/2}{\sqrt{N/4}} \xrightarrow{d} \mathcal{N}(0, 1)$ | Asymptotic normal convergence as $N \to \infty$ |
| **Conditional QBER** | $Q = p_E(0.25) + (1 - p_E)\eta$ | Error rate introduced by Eve's measurement collapse |
| **Shannon Binary Entropy** | $H_2(p) = -p\log_2 p - (1-p)\log_2(1-p)$ | Information leakage measure |
| **Secret Key Capacity** | $R = \max(0, 1 - 2H_2(Q))$ | Shor-Preskill asymptotic bound; $R = 0$ at $Q = 11.0\%$ |
| **One-Time Pad Secrecy** | $P(M=m \mid C=c) = P(M=m)$ | Shannon Perfect Secrecy: $H(M \mid C) = H(M)$ |

---

## 📜 License
This project is open-source under the [MIT License](LICENSE).
