# Real-Time Avatar Interaction

Welcome to the Real-Time Avatar Interaction project! This application creates an interactive experience between the user and a real-time avatar using Hygen's advanced avatar technology and OpenAI's language model. The project enables users to converse with an avatar in real-time, converting speech to text using OpenAI's Whisper API and generating responses through OpenAI's GPT-4o.

## Features

- **Real-Time Interaction:** Engage in live conversations with a virtual avatar.
- **Speech-to-Text Conversion:** Convert spoken words into text using OpenAI's Whisper API.
- **Avatar Responses:** Receive responses from the avatar based on the text input.
- **Seamless Experience:** Enjoy a fluid interaction where the avatar's responses are delivered in real-time.

## Technologies Used

- **React:** For building the user interface.
- **TypeScript:** To enhance code quality and maintainability.
- **Tailwind CSS:** For styling and creating a responsive design.
- **Shadcn:** For additional UI components and enhancements.
- **OpenAI:** For text generation using GPT-4o and speech recognition using Whisper API.
- **Streaming Avatar API:** To integrate and control the avatar's real-time responses.


## Getting Started

To get started with the project locally, follow these steps:

1. **Clone the repository:**

   ```bash
   git clone https://github.com/santhosh404/hygen-openai-task.git
   ```
2. **Navigate to the project directory:**

   ```bash
   cd hygen-openai-task
   ```
3. **Install the dependencies:**

   ```bash
   npm install
   ```

4. **Set up environment variables:**

   Create a `.env` file in the root directory with the following variables:
   ```env
   # OpenAI API Configuration
   VITE_OPENAI_API_KEY=your_openai_api_key_here
   
   # HeyGen API Configuration
   VITE_HEYGEN_API_KEY=your_heygen_api_key_here
   VITE_HEYGEN_AVATARID=your_avatar_id_here
   VITE_HEYGEN_VOICEID=your_voice_id_here
   ```

5. **Start the development server:**

   ```bash
   npm run dev
   ```

6. **Open your browser and go to http://localhost:5173 to see the application in action.**

