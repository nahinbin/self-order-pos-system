"use client";

import { useEffect } from "react";
import { redirect } from "next/navigation";

export default function AdminCustomerDisplayRedirectPage() {
  useEffect(() => {
    redirect("/customer-display");
  }, []);
  return null;
}

