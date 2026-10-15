// General questions a student can bring to the international office. They ask about the student's own record and plans;
// they do not assume an answer or describe what the rules say. Students pick the ones they want.
export const questionGroups = [
  { id: "record", label: "My record and documents" },
  { id: "travel", label: "Travel" },
  { id: "work", label: "Work and training" },
  { id: "program", label: "Program and enrollment" },
  { id: "life", label: "Insurance, housing and daily life" },
  { id: "after", label: "After my program" },
];

export const officeQuestions = [
  { id: "rec-dates", group: "record", text: "Can we check that the dates and program details on my I-20 or DS-2019 are correct?" },
  { id: "rec-address", group: "record", text: "Which of my details, such as my address, do you need to have on file, and how do I update them?" },
  { id: "rec-new-rule", group: "record", text: "Does any recent rule change affect my record? Where can I read about it?" },
  { id: "rec-admit", group: "record", text: "How do I check the admission period shown on my I-94, and who do I tell if something looks wrong?" },
  { id: "travel-sign", group: "travel", text: "Is my travel signature current for the trip I am planning?" },
  { id: "travel-docs", group: "travel", text: "What should I carry when I travel and come back, given my situation?" },
  { id: "travel-notify", group: "travel", text: "Should I tell your office about my travel dates, and how far ahead?" },
  { id: "work-allowed", group: "work", text: "What kinds of work am I allowed to do now, and what needs approval first?" },
  { id: "work-training", group: "work", text: "What are my options for practical training, and when should I start planning?" },
  { id: "work-offer", group: "work", text: "I have an offer or an idea for a job. What do I need to do before I start?" },
  { id: "prog-load", group: "program", text: "What course load do I need each term, and what happens if I need to change it?" },
  { id: "prog-change", group: "program", text: "What should I do before I change my program, my major or my school?" },
  { id: "prog-end", group: "program", text: "Can we go over my program end date and what to do if I need more time?" },
  { id: "life-insurance", group: "life", text: "Does my health insurance meet the school’s requirements, and who do I ask about a waiver?" },
  { id: "life-housing", group: "life", text: "Who can help with housing questions or a problem with a landlord?" },
  { id: "life-emergency", group: "life", text: "Who should I contact in an emergency, on campus and after hours?" },
  { id: "after-options", group: "after", text: "What are my options after my program ends, and which dates should I ask about?" },
  { id: "after-leave", group: "after", text: "What do I need to do with you before I leave the university or the country?" },
];
