"use client";
import{QueryClient,QueryClientProvider}from"@tanstack/react-query";import{useState}from"react";
import{ReactQueryDevtools}from"@tanstack/react-query-devtools";
export function AppQueryProvider({children}:{children:React.ReactNode}){const[client]=useState(()=>new QueryClient({defaultOptions:{queries:{staleTime:5_000,retry:1,refetchOnWindowFocus:false},mutations:{retry:0}}}));return <QueryClientProvider client={client}>{children}{process.env.NODE_ENV!=="production"?<ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />:null}</QueryClientProvider>}
