import { ArrowLeft, Mail, MessagesSquare, Phone } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/Button";

interface HeaderCardProps {
  handleBack: () => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onSearch?: () => void;
}

const ContactCard = ({img, label, description, onClick}: {img: React.ReactNode, label: string, description: string, onClick?: () => void}) => {
  return (
    <div onClick={onClick} className="flex flex-col justify-center bg-white/10 border border-white/40 text-white p-4 rounded-lg shadow-md max-w-[240px]">
      {img}
      <p className="text-lg font-semibold mt-2">{label}</p>
      <p className="text-sm mt-1">{description}</p>
    </div>
  );
}

export default function HeaderCard({ handleBack, searchValue = "", onSearchChange, onSearch }: HeaderCardProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="bg-gradient-to-r from-[#db8833] to-[#ff9d00] w-full overflow-hidden" >
      <div
        className={`min-h-screen`}
        style={{
          backgroundImage: `
      url('/assets/common/background.png'),
      url('/assets/common/background.png')
    `,
          backgroundPosition: 'top left, bottom right',
          backgroundRepeat: 'no-repeat, no-repeat',
          backgroundSize: '300px, 300px',
        }}
      >
        <Button
          className="flex-1 h-11 m-8 rounded-full text-sm bg-white text-primary-500 hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          onClick={handleBack}
        >
          <ArrowLeft size={15} />
          Back
        </Button>
        <div className="flex flex-col items-center justify-center">
          <p className="text-sm text-white bg-white/20 px-2 py-1 rounded-xl">
            SUPPORT CENTER
          </p>
          <p className="text-3xl text-white font-bold my-4">CUSTOMER SUPPORT</p>
          <p className="text-sm text-white text-center">
            Need help with a product that's not listed here? Our team is available Monday-
            <br />
            Friday, 8 AM-5 PM (Central Time), and we're happy to assist!
          </p>
          <div className="flex flex-row gap-3 items-center justify-center mt-8">
          <ContactCard   
          onClick={() => {}} 
          img={<MessagesSquare 
          size={22} />} 
          label="Ask a Specialist" 
          description="Real-time chat is the fastest support channel." />
          <ContactCard   
          onClick={() => {window.location.href = "tel:+18008301416";}} 
          img={<Phone size={22} />} 
          label="Call Us" 
          description="1.800.830.1416 (Business hours apply)" />
          <ContactCard   
          onClick={() => {window.location.href = "mailto:information@realityworks.com";}} 
          img={<Mail size={22} />} 
          label="Email Support" 
          description="Response time may be up to 24 hours." />
        </div>
        <div className="flex items-center justify-center my-12 px-4 w-full">
          <div
            className="flex items-center h-12 rounded-full bg-white overflow-hidden transition-all duration-200 w-full max-w-xl"
            style={{
              border: focused ? "2px solid white" : "2px solid #db8833",
              boxShadow: focused ? "0 0 0 4px rgba(255,255,255,0.5)" : "none",
            }}
          >
            <span className="pl-4 flex items-center shrink-0">
              <svg fill="#db8833" width="20px" height="20px" viewBox="0 0 1.4 1.4"><path d="M0.345 1.239H1.056q0.184 0 0.183 -0.182V0.342q0 -0.181 -0.183 -0.182H0.345c-0.122 0 -0.184 0.06 -0.184 0.182v0.716c0 0.121 0.062 0.182 0.184 0.182m0.002 -0.094c-0.059 0 -0.091 -0.031 -0.091 -0.092v-0.706c0 -0.061 0.033 -0.092 0.091 -0.092h0.708c0.058 0 0.091 0.031 0.091 0.092v0.706c0 0.061 -0.033 0.092 -0.091 0.092Zm0.342 -0.325c0.03 0 0.047 -0.019 0.047 -0.042v-0.007c0 -0.033 0.019 -0.054 0.06 -0.081 0.057 -0.038 0.097 -0.071 0.097 -0.142 0 -0.097 -0.087 -0.15 -0.186 -0.15 -0.1 0 -0.166 0.048 -0.183 0.102a0.1 0.1 0 0 0 -0.005 0.029c0 0.026 0.02 0.04 0.04 0.04 0.033 0 0.039 -0.018 0.057 -0.04a0.096 0.096 0 0 1 0.087 -0.052c0.053 0 0.088 0.03 0.088 0.075 0 0.04 -0.025 0.059 -0.076 0.095 -0.042 0.029 -0.074 0.06 -0.074 0.118v0.008c0 0.03 0.017 0.046 0.047 0.046m-0.001 0.175c0.034 0 0.063 -0.027 0.063 -0.061s-0.029 -0.061 -0.063 -0.061 -0.063 0.028 -0.063 0.061 0.029 0.061 0.063 0.061"/></svg>
            </span>
            <input
              className="h-full flex-1 min-w-0 px-3 text-sm text-gray-800 placeholder:text-primary-300 bg-white outline-none"
              placeholder="Have a Question? Ask or enter a search term..."
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch?.()}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
            <button
              onClick={onSearch}
              className="h-full px-5 sm:px-6 text-sm font-semibold bg-primary-500 text-white hover:bg-white hover:text-primary-500 border-l-2 border-primary-400 transition-colors duration-200 shrink-0 whitespace-nowrap"
            >
              Search
            </button>
          </div>
        </div>  
        </div>
      </div>
    </div>
  );
}
