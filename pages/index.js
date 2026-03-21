// import Image from "next/image";
// import { Geist, Geist_Mono, Inter } from "next/font/google";

// const geistSans = Geist({
//   variable: "--font-geist-sans",
//   subsets: ["latin"],
// });

// const geistMono = Geist_Mono({
//   variable: "--font-geist-mono",
//   subsets: ["latin"],
// });

// const interFont = Inter({
//   variable: "--font-inter",
//   subsets: ["latin"],
// })

import Navbar from "../src/components/Navbar";
import LandingBody from "../src/components/LandingBody";
import Head from "next/head";


/* 
development workflow:
  npm run dev
deploying to production: 
  npm run build to build the app
  npm run start to run the app in production mode
*/
export default function Home() {
  
  return (
    <> {/* to group multiple elements/components together */}
      <Head>
       <title>sentiment-analysis.ai | Home</title> 
      </Head>
      <Navbar/>
      <LandingBody/>
    </>
  );
}
