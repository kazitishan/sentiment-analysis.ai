//hook to determine the state of which section is active (defaults to overview)
import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from '@/lib/supabase';


import Squares from "./Squares";
import SpotlightCard from "./SpotlightCard";
import BrainIcon from "../../public/vecteezy_ai-technology-brain-icon-illustration-isolated_55810405.svg";
import SpeedometerIcon from "../../public/speedometer.svg";
import OpensourceIcon from "../../public/open-source.svg";
import SecurityIcon from "../../public/security.svg";
import ExpandDown from "../../public/Expand_down.svg";


let faqData = [
  {
    question: "Most chatbots natively support spreadsheet support. Why this product?",
    answer: "While it's true that many chatbots can natively process spreadsheets, chatbots are known to 'hack' around their limitations by hard-coding",
    isOpened: false
  },
  {
    question: "How is data stored?",
    answer: "We implement robust security measures to protect your data at all times.",
    isOpened: false
  },
  {
    question: "I found a bug, how can I report it?",
    answer: "We welcome bug reports and feedback! Please visit our GitHub repository and open an issue with a detailed description of the problem you encountered.",
    isOpened: false
  },
  {
    question: "What file formats are supported?",
    answer: "We support .csv and .xlsx file formats for spreadsheet uploads. If you have a different format, please let us know via our GitHub repository.",
    isOpened: false
  },
  {
    question: "How can I cancel my subscription?",
    answer: "You can cancel your subscription at any time by going to your account settings and selecting the 'Cancel Subscription' option. If you need assistance, please reach out via our Github repository.",
    isOpened: false
  },
  {
    question: "How long are my sentisheets retained as a guest?",
    answer: "We offer a generous retention period of 30 days for sentisheets created by guest users. This means that your sentisheets will be securely stored and accessible for up to 30 days from the date of creation. After this period, the sentisheets will be automatically deleted from our servers for storage efficency.",
    isOpened: false
  }

];

export default function LandingBody() {
  const [activeSection, setActiveSection] = useState("Overview");
  const [FAQstatus, setFAQstatus] = useState(faqData);
  const router = useRouter();
  useEffect(() => {
  
      const checkUser = async () => {
        const { data: { session } } = await supabase.auth.getSession();
            if (session?.user && !session.user.is_anonymous) {
                router.push('/create');
            }
        };
        checkUser();
  }, [router]);  
  return (
    <>
      <div aria-label="Landing page content" className="flex flex-col items-center justify-start space-y-6 p-8 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 blur-[1.5px]">
          <Squares
            speed={0.2}
            cellWidth={100}
            cellHeight={40}
            direction="up"
          />
        </div>

        <h1 className="rainbow-transition text-rainbow-mask">Sentiment analysis in seconds.</h1>
        <p>Upload your spreadsheet and let AI conduct sentiment analysis in the matter of seconds — free of charge, no download and no account required.</p>
        <button className="bg-background rounded text-2xl rainbow-transition" style={{boxShadow: '0 4px 4px 0 #440098 inset, 0 4px 1px 0 #1F45DA inset', filter: 'drop-shadow(0 4px 4px rgba(0, 0, 0, 0.25))'}}><Link href="/create">Try for free</Link></button>
        <div className="relative inline-block">
          <Image src="/outline-sentisheet-2.png" alt="Sentisheet demo outline" width={850} height={400} className="rainbow-transition"/>
          <Image src="/sentisheet-raw.png" alt="Sentisheet demo" width={850} height={400} className="absolute -top-[1.2px] left-0 z-0"/>
        </div>
       
      </div>
        <ul className="flex space-x-4 text-4xl justify-center bg-background -mt-8 relative z-1 p-3 shadow-bottom">
          <li
            onClick={() => setActiveSection("Overview")}
            className="relative cursor-pointer"
          >
            Overview
            <hr className={`rainbow-transition absolute -bottom-3 inset-x-0 h-1 border-0 rounded-t-[20px] bg-gradient-to-b from-blue-700 to-violet-600 transition-opacity ${activeSection === "Overview" ? "opacity-100" : "opacity-0"}`} />
          </li>
          <div className="border-l-2 border-gray-400 h-8 w-2 self-center"/>

          <li
            onClick={() => setActiveSection("FAQ")}
            className="relative cursor-pointer"
          >
            FAQ
            <hr className={`rainbow-transition absolute -bottom-3 inset-x-0 h-1 border-0 rounded-t-[20px] bg-gradient-to-b from-blue-700 to-violet-600 transition-opacity ${activeSection === "FAQ" ? "opacity-100" : "opacity-0"}`} />
          </li>
          <div className="border-l-2 border-gray-400 h-8 w-2 self-center  "/>
          <li
            onClick={() => setActiveSection("Plans and pricing")}
            className="relative cursor-pointer"
          >
            Plans and pricing
            <hr className={`rainbow-transition absolute -bottom-3 inset-x-0 h-1 border-0 rounded-t-[20px] bg-gradient-to-b from-blue-700 to-violet-600 transition-opacity ${activeSection === "Plans and pricing" ? "opacity-100" : "opacity-0"}`} />
          </li>
        </ul>
        <div className={`bg-background overflow-hidden ${activeSection === "Overview" ? "grid grid-cols-2 gap-8 p-8 h-full w-full" : "invisible h-0"}`}>
          <SpotlightCard className="bg-background rainbow-transition flex flex-col p-12 outlined" spotlightColor="rgba(43, 108, 176, 0.18)" >
            <BrainIcon width={100} height={100} className="[&_path]:fill-blue-700" viewBox="0 0 5000 5000"/> {/*0 0: start showing the svg at the very beginning of the grid
            where: X-axis: Still goes left to right (0 to 5000)
            Y-axis: Still goes top to bottom (0 to 5000)
            5000 5000: Creates a canvas that is 5,000 units wide and 5,000 units high.
            think flash light analogy: the viewbox is the positon of the beam while the width and height determine how wide and how far the beam shines
            () */}
            <h2 className="py-1" >Algorithmic Batching</h2>
            <p>Sentiment analysis done with the mind of both accuracy and speed. Process hundreds of rows in seconds or thousands of rows in minutes.</p>
          </SpotlightCard>
          <SpotlightCard className="rainbow-transition flex flex-col p-8 h-full gap-1 outlined" spotlightColor="rgba(43, 108, 176, 0.15)" >
            <SpeedometerIcon width={100} height={100} className="[&_path]:fill-blue-700/70" viewBox="0 0 139 139"/>
            <h2 className="py-1">Usage Transparency</h2>
            <p>Track your daily usage, manage data retention, and permanently delete requests. No hidden limits or surprise bills.</p>
          </SpotlightCard>
          <SpotlightCard className="rainbow-transition flex flex-col p-8 h-full gap-1 outlined" spotlightColor="rgba(43, 108, 176, 0.15)" >
            <OpensourceIcon width={100} height={100} className="[&_path]:fill-blue-700/70" viewBox="0 0 512 512"/>
            <h2 className="py-1">Open Source</h2>
            <p>It's never been more easier to tinker with products. Running a different LLM model? Modifying the batching algorithm? Do so freely via the GitHub repository of this project.</p>
          </SpotlightCard>
          <SpotlightCard className="rainbow-transition flex flex-col p-8 h-full gap-1 outlined" spotlightColor="rgba(43, 108, 176, 0.15)" >
            <SecurityIcon width={100} height={100} className="[&_path]:fill-blue-700/70" viewBox="0 0 512 512"/>
            <h2 className="py-1">Private by Design</h2>
            <p>Your data stays yours. Files are processed and stored on SOC 2 compliant infrastructure — never sold, never used for ads.</p>
          </SpotlightCard>
        </div>
        <div className={`w-full overflow-hidden ${activeSection === "FAQ" ? "grid grid-cols-2 p-8 gap-8 text-2xl mx-auto items-start" : "invisible h-0"}`}>
          {faqData.map((item, index) => (
            <div key={index} className=" bg-foreground text-background flex-1 p-4 rounded-2xl">
              <div className="flex items-center justify-between">              
                <h3>{item.question}</h3>
                <button onClick={() => {
                  setFAQstatus(faqData[index].isOpened = !faqData[index].isOpened);
                }} className="rounded hover:cursor-pointer ">
                  <ExpandDown width={44} height={44} className={`[&_path]:stroke-background [&_path]:fill-none ${item.isOpened ? "rotate-180" : "rotate-0"}`}/>
                </button>
              </div>
              <p className={`transition-max-height duration-500 ease-in-out overflow-hidden ${item.isOpened ? "h-full" : "max-h-0"}`}>{item.answer}</p>
            </div>
          ))}
        </div>
        <div className={`w-full overflow-hidden ${activeSection === "Plans and pricing" ? "p-8" : "invisible h-0"}`}>
          <div className="rounded-2xl overflow-hidden bg-background text-foreground border-3 border-foreground">
            <table className="w-full border-collapse text-left text-base">
              <thead>
                <tr className="border-b-2 border-foreground/10">
                  <th className="p-4 text-sm font-normal opacity-60 w-36">Plan type &amp; pricing</th>
                  <th className="p-4">
                    <div className="text-4xl font-bold">Guest</div>
                    <div className="text-sm font-normal opacity-60">$0/mo</div>
                  </th>
                  <th className="p-4">
                    <div className="text-4xl font-bold">Account</div>
                    <div className="text-sm font-normal opacity-60">$0/mo</div>
                  </th>
                  <th className="p-4">
                    <div className="text-4xl font-bold rainbow-transition text-rainbow-mask">Pro</div>
                    <div className="text-sm font-normal opacity-60">$4.99/mo</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b-2 border-foreground/10">
                  <th className="p-4 text-sm font-normal opacity-60">Best for</th>
                  <td className="p-4">Casual researcher, student, marketer interested with performing sentiment analysis</td>
                  <td className="p-4">Aspiring professionals seeking large-scale sentiment analysis</td>
                  <td className="p-4">Professionals requiring precision, benchmarking, at a large-scale basis</td>
                </tr>
                <tr className="border-b-2 border-foreground/10">
                  <th className="p-4 text-sm font-normal opacity-60">Persistent Cloud storage</th>
                  <td className="p-4"></td>
                  <td className="p-4">✓</td>
                  <td className="p-4">✓</td>
                </tr>
                <tr className="border-b-2 border-foreground/10">
                  <th className="p-4 text-sm font-normal opacity-60">Daily character limit*</th>
                  <td className="p-4">25,000 characters</td>
                  <td className="p-4">250,000 characters</td>
                  <td className="p-4">250,000 characters</td>
                </tr>
                <tr className="border-b-2 border-foreground/10">
                  <th className="p-4 text-sm font-normal opacity-60">Available models</th>
                  <td className="p-4">Gemini Flash 2.5 Lite</td>
                  <td className="p-4">Gemini Flash 2.5 Lite</td>
                  <td className="p-4">
                    <div>Gemini Flash 2.5 Lite</div>
                    <div className="rainbow-transition text-rainbow-mask">Gemini 2.5 Flash</div>
                    <div className="rainbow-transition text-rainbow-mask">Gemini 2.5 Pro</div>
                    <div className="rainbow-transition text-rainbow-mask">GPT-4.1 nano</div>
                    <div className="rainbow-transition text-rainbow-mask">GPT-4.1 mini</div>
                    <div className="rainbow-transition text-rainbow-mask">GPT-4.1</div>
                    <div className="rainbow-transition text-rainbow-mask">Claude Sonnet 4</div>
                  </td>
                </tr>
                <tr className="border-b-2 border-foreground/10">
                  <th className="p-4 text-sm font-normal opacity-60">Sentiment presets</th>
                  <td className="p-4">
                    <div>Basic Sentiment</div>
                    <div>Granular Sentiment Scale</div>
                    <div>Dr. Ekman&apos;s Six Basic Emotions</div>
                  </td>
                  <td className="p-4">
                    <div>Basic Sentiment</div>
                    <div>Granular Sentiment Scale</div>
                    <div>Dr. Ekman&apos;s Six Basic Emotions</div>
                  </td>
                  <td className="p-4">
                    <div>Basic Sentiment</div>
                    <div>Granular Sentiment Scale</div>
                    <div>Dr. Ekman&apos;s Six Basic Emotions</div>
                    <div className="rainbow-transition text-rainbow-mask">Unlimited custom presets</div>
                  </td>
                </tr>
                <tr>
                  <td className="p-4"></td>
                  <td className="p-4 ">
                    <Link href="/create">
                    <button className="w-full bg-foreground text-background hover:cursor-pointer">Try for free
                    </button>
                    </Link>
                  </td>
                  <td className="p-4">
                    <Link href="/signup">
                      <button className="w-full bg-foreground text-background hover:cursor-pointer">Sign up for free</button>
                    </Link>
                  </td>
                  <td className="p-4">
                    <Link href="/login?buyingSubscription=true">
                      <button className="rainbow-transition w-full bg-gradient-to-b from-blue-700 to-violet-600 text-white hover:cursor-pointer">Subscribe</button>
                    </Link>
                  </td>
                  
                </tr>
              </tbody>
            </table>
          </div>
        </div>
    </>
  );
}
