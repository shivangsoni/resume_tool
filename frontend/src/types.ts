export type Profile = {
  firstName: string; lastName: string; email: string; phone: string; location: string;
  headline: string; summary: string; linkedin: string; portfolio: string;
  workAuthorization: string; sponsorship: string; skills: string;
}

export type Application = {
  id: string; company: string; role: string; location: string; status: 'Draft' | 'Applied' | 'Interview'; updatedAt: string;
}
